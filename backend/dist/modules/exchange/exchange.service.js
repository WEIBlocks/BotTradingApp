import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { exchangeConnections, exchangeAssets } from '../../db/schema/exchanges.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { NotFoundError, AppError, ConflictError } from '../../lib/errors.js';
import { createAdapter } from './adapters/adapter.factory.js';
import { sendNotification } from '../../lib/notify.js';
import { env } from '../../config/env.js';
const SUPPORTED_EXCHANGES = [
    {
        name: 'Coinbase',
        subtitle: 'Popular US exchange',
        methods: ['oauth', 'api_key'],
        color: '#0052FF',
    },
    {
        name: 'Binance',
        subtitle: 'Largest global exchange',
        methods: ['api_key'],
        color: '#F0B90B',
    },
    {
        name: 'Kraken',
        subtitle: 'Established crypto exchange',
        methods: ['api_key'],
        color: '#5741D9',
    },
    {
        name: 'Alpaca',
        subtitle: 'Commission-free stock & crypto',
        methods: ['api_key', 'oauth'],
        color: '#F5D547',
    },
];
export async function getAvailableExchanges() {
    return SUPPORTED_EXCHANGES;
}
/** Wraps a promise with a timeout — rejects with AppError if it takes too long */
function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new AppError(408, message, 'TIMEOUT')), ms)),
    ]);
}
export async function connectWithApiKey(userId, provider, apiKey, apiSecret, sandbox = false) {
    // Check for existing connected exchange of the same provider
    const [existingConn] = await db
        .select()
        .from(exchangeConnections)
        .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.provider, provider), eq(exchangeConnections.status, 'connected')))
        .limit(1);
    if (existingConn) {
        throw new ConflictError(`${provider} is already connected. Disconnect it first to reconnect with new credentials.`);
    }
    // Use adapter to test connection with the real exchange
    let adapter;
    try {
        adapter = createAdapter(provider);
    }
    catch {
        // Unsupported adapter; fall back to storing without test
        adapter = null;
    }
    if (adapter) {
        // connect() can be slow on Binance (KuCoin market pre-load) — cap at 30s
        await withTimeout(adapter.connect({ apiKey, apiSecret, sandbox }), 30_000, `Connection to ${provider} timed out. The exchange may be slow — please try again.`);
        let success;
        try {
            success = await withTimeout(adapter.testConnection(), 15_000, `${provider} did not respond in time. Please try again.`);
        }
        catch (testErr) {
            await adapter.disconnect().catch(() => { });
            // Surface the adapter's own error message (e.g. Binance's specific rejection reason)
            throw new AppError(400, testErr.message ?? `Failed to connect to ${provider}. Please check your API credentials.`);
        }
        if (!success) {
            await adapter.disconnect().catch(() => { });
            await sendNotification(userId, {
                type: 'alert',
                title: 'Exchange Connection Failed',
                body: `Could not connect to ${provider}. Please verify your API credentials.`,
                priority: 'high',
            }).catch(() => { });
            throw new AppError(400, `Failed to connect to ${provider}. Please check your API credentials.`);
        }
        // Disconnect test adapter — balance sync uses a fresh adapter instance below
        await adapter.disconnect().catch(() => { });
    }
    // Encrypt credentials
    const apiKeyEnc = encrypt(apiKey);
    const apiSecretEnc = encrypt(apiSecret);
    // Determine asset class from provider
    const assetClass = provider.toLowerCase() === 'alpaca' ? 'stocks' : 'crypto';
    const [connection] = await db
        .insert(exchangeConnections)
        .values({
        userId,
        provider,
        method: 'api_key',
        apiKeyEnc,
        apiSecretEnc,
        assetClass: assetClass,
        sandbox,
        status: 'connected',
        lastSyncAt: new Date(),
    })
        .returning();
    // Trigger a full portfolio sync immediately after connect — populates exchange_assets,
    // computes allocations, saves a snapshot, and pushes a portfolio_update via WebSocket
    // so the portfolio page shows real data the moment the user lands on it.
    setImmediate(async () => {
        try {
            const { refreshUserPortfolio } = await import('../../jobs/portfolio-update.job.js');
            await refreshUserPortfolio(userId);
            console.log(`[Exchange] Immediate portfolio sync complete for ${provider} (${connection.id.slice(0, 8)})`);
        }
        catch (err) {
            console.warn(`[Exchange] Immediate portfolio sync failed for ${provider}:`, err.message);
        }
    });
    await sendNotification(userId, {
        type: 'system',
        title: 'Exchange Connected',
        body: `Your ${provider} account has been connected successfully.`,
    }).catch(() => { });
    return connection;
}
export async function testConnection(provider, apiKey, apiSecret, sandbox = false) {
    let adapter;
    try {
        adapter = createAdapter(provider);
    }
    catch {
        throw new AppError(400, `Unsupported exchange: ${provider}`);
    }
    try {
        // connect() can be slow on Binance (KuCoin market pre-load) — cap at 30s
        await withTimeout(adapter.connect({ apiKey, apiSecret, sandbox }), 30_000, `Connection to ${provider} timed out. The exchange may be slow — please try again.`);
        let success;
        try {
            success = await withTimeout(adapter.testConnection(), 15_000, `${provider} did not respond in time. Please try again.`);
        }
        catch (testErr) {
            await adapter.disconnect().catch(() => { });
            throw new AppError(400, testErr.message ?? `Failed to connect to ${provider}. Please verify your API key and secret.`);
        }
        await adapter.disconnect().catch(() => { });
        if (!success) {
            throw new AppError(400, `Failed to connect to ${provider}. Please check your API credentials.`);
        }
        return { success: true, provider, message: `Successfully connected to ${provider}!` };
    }
    catch (err) {
        await adapter.disconnect().catch(() => { });
        if (err instanceof AppError)
            throw err;
        console.error(`[Exchange] testConnection failed for ${provider}:`, err.message);
        throw new AppError(400, `Failed to connect to ${provider}. Please verify your API key and secret.`);
    }
}
export async function getUserConnections(userId) {
    const connections = await db
        .select({
        id: exchangeConnections.id,
        provider: exchangeConnections.provider,
        method: exchangeConnections.method,
        status: exchangeConnections.status,
        sandbox: exchangeConnections.sandbox,
        accountLabel: exchangeConnections.accountLabel,
        totalBalance: exchangeConnections.totalBalance,
        assetClass: exchangeConnections.assetClass,
        lastSyncAt: exchangeConnections.lastSyncAt,
        errorMessage: exchangeConnections.errorMessage,
        createdAt: exchangeConnections.createdAt,
    })
        .from(exchangeConnections)
        .where(eq(exchangeConnections.userId, userId));
    return connections;
}
export async function resync(connectionId, userId) {
    // Set status to syncing
    const [conn] = await db
        .update(exchangeConnections)
        .set({ status: 'syncing', updatedAt: new Date() })
        .where(and(eq(exchangeConnections.id, connectionId), eq(exchangeConnections.userId, userId)))
        .returning();
    if (!conn) {
        throw new NotFoundError('Exchange connection');
    }
    // Decrypt credentials and use adapter to fetch real balances
    let adapter;
    try {
        if (!conn.apiKeyEnc || !conn.apiSecretEnc) {
            throw new Error('Missing encrypted credentials');
        }
        let apiKey;
        let apiSecret;
        try {
            apiKey = decrypt(conn.apiKeyEnc);
            apiSecret = decrypt(conn.apiSecretEnc);
        }
        catch {
            throw new Error('Credentials are corrupted — please disconnect and reconnect your exchange.');
        }
        adapter = createAdapter(conn.provider);
        await adapter.connect({ apiKey, apiSecret, sandbox: conn.sandbox ?? false });
        const balances = await adapter.getBalances();
        const connAssetClass = conn.assetClass ?? 'crypto';
        const STABLE = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI']);
        // For crypto: batch-fetch tickers to avoid serial N×200ms calls
        const priceMap = new Map();
        const nonZero = balances.filter(b => b.total > 0 || b.free > 0);
        if (connAssetClass !== 'stocks' && adapter.getTickers) {
            const cryptoSymbols = nonZero
                .map(b => `${b.currency.toUpperCase()}/USDT`)
                .filter(s => !STABLE.has(s.replace('/USDT', '')));
            if (cryptoSymbols.length > 0) {
                const fetched = await adapter.getTickers(cryptoSymbols).catch(() => new Map());
                for (const [k, v] of fetched)
                    priceMap.set(k, v);
            }
        }
        await adapter.disconnect();
        // Delete old assets and insert fresh data
        await db
            .delete(exchangeAssets)
            .where(eq(exchangeAssets.exchangeConnId, connectionId));
        let totalUsd = 0;
        const rows = [];
        for (const bal of nonZero) {
            const sym = bal.currency.toUpperCase();
            let valueUsd = 0;
            if (STABLE.has(sym)) {
                valueUsd = bal.total;
            }
            else if (connAssetClass === 'stocks') {
                valueUsd = bal.total;
            }
            else {
                const price = priceMap.get(sym);
                if (price)
                    valueUsd = bal.total * price;
            }
            totalUsd += valueUsd;
            const resyncAmount = connAssetClass === 'stocks' && !STABLE.has(sym) ? bal.free : bal.total;
            rows.push({
                exchangeConnId: connectionId,
                symbol: bal.currency,
                amount: String(resyncAmount),
                valueUsd: valueUsd.toFixed(2),
                allocation: '0',
            });
        }
        // Compute allocation in memory
        if (totalUsd > 0) {
            for (const row of rows) {
                row.allocation = ((parseFloat(row.valueUsd) / totalUsd) * 100).toFixed(2);
            }
        }
        // Bulk insert (chunked to stay within PG parameter limits)
        if (rows.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < rows.length; i += CHUNK) {
                await db.insert(exchangeAssets).values(rows.slice(i, i + CHUNK));
            }
        }
        // Update connection with new balance
        const [result] = await db
            .update(exchangeConnections)
            .set({
            status: 'connected',
            totalBalance: String(totalUsd.toFixed(2)),
            lastSyncAt: new Date(),
            errorMessage: null,
            updatedAt: new Date(),
        })
            .where(eq(exchangeConnections.id, connectionId))
            .returning();
        return result;
    }
    catch (err) {
        if (adapter)
            await adapter.disconnect().catch(() => { });
        // Mark as error
        const [result] = await db
            .update(exchangeConnections)
            .set({
            status: 'error',
            errorMessage: err.message,
            updatedAt: new Date(),
        })
            .where(eq(exchangeConnections.id, connectionId))
            .returning();
        return result;
    }
}
export async function disconnect(connectionId, userId) {
    // Delete associated assets first (cascade should handle this, but be explicit)
    await db
        .delete(exchangeAssets)
        .where(eq(exchangeAssets.exchangeConnId, connectionId));
    const [deleted] = await db
        .delete(exchangeConnections)
        .where(and(eq(exchangeConnections.id, connectionId), eq(exchangeConnections.userId, userId)))
        .returning();
    if (!deleted) {
        throw new NotFoundError('Exchange connection');
    }
    return deleted;
}
function getOAuthConfig(provider) {
    const p = provider.toLowerCase();
    if (p === 'coinbase') {
        if (!env.COINBASE_CLIENT_ID) {
            throw new AppError(503, 'Coinbase OAuth is not configured. Set COINBASE_CLIENT_ID and COINBASE_CLIENT_SECRET.', 'OAUTH_UNAVAILABLE');
        }
        return {
            authUrl: 'https://www.coinbase.com/oauth/authorize',
            tokenUrl: 'https://api.coinbase.com/oauth/token',
            clientId: env.COINBASE_CLIENT_ID,
            clientSecret: env.COINBASE_CLIENT_SECRET,
            redirectUri: env.COINBASE_REDIRECT_URI,
            scopes: ['wallet:accounts:read', 'wallet:transactions:read'],
            accountUrl: 'https://api.coinbase.com/v2/accounts',
        };
    }
    if (p === 'alpaca') {
        // Alpaca OAuth placeholder — would need ALPACA_CLIENT_ID etc.
        throw new AppError(503, `OAuth for ${provider} is not yet supported. Use API key connection instead.`, 'OAUTH_UNAVAILABLE');
    }
    throw new AppError(400, `OAuth is not available for ${provider}. Use API key connection instead.`);
}
// ─── OAuth Endpoints ─────────────────────────────────────────────────────────
export async function initiateOAuth(provider) {
    const config = getOAuthConfig(provider);
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(' '),
        state,
    });
    return {
        authUrl: `${config.authUrl}?${params.toString()}`,
        state,
        provider,
    };
}
export async function handleOAuthCallback(provider, code, userId) {
    // Check for existing connected exchange of the same provider
    const [existingConn] = await db
        .select()
        .from(exchangeConnections)
        .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.provider, provider), eq(exchangeConnections.status, 'connected')))
        .limit(1);
    if (existingConn) {
        throw new ConflictError(`${provider} is already connected. Disconnect it first to reconnect.`);
    }
    const config = getOAuthConfig(provider);
    // Exchange authorization code for access token
    const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
        }),
    });
    if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        throw new AppError(400, `OAuth token exchange failed for ${provider}: ${errBody}`, 'OAUTH_TOKEN_ERROR');
    }
    const tokenData = (await tokenResponse.json());
    if (!tokenData.access_token) {
        throw new AppError(400, `${provider} did not return an access token.`, 'OAUTH_TOKEN_ERROR');
    }
    // Store the encrypted tokens
    const [connection] = await db
        .insert(exchangeConnections)
        .values({
        userId,
        provider,
        method: 'oauth',
        oauthTokenEnc: encrypt(tokenData.access_token),
        oauthRefreshEnc: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        status: 'connected',
        lastSyncAt: new Date(),
    })
        .returning();
    // Fetch account data if available
    if (config.accountUrl) {
        try {
            const accountResponse = await fetch(config.accountUrl, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (accountResponse.ok) {
                const accountData = (await accountResponse.json());
                let totalUsd = 0;
                const accounts = accountData.data ?? [];
                for (const acct of accounts) {
                    const amount = parseFloat(acct.balance?.amount ?? '0');
                    if (amount <= 0)
                        continue;
                    const symbol = acct.currency?.code ?? acct.balance?.currency ?? 'UNKNOWN';
                    // For stablecoins, value = amount. For others, we'd need price lookup.
                    let valueUsd = 0;
                    if (['USD', 'USDT', 'USDC', 'BUSD'].includes(symbol)) {
                        valueUsd = amount;
                    }
                    else {
                        // Attempt price fetch via ccxt adapter if available
                        try {
                            const adapter = createAdapter('binance');
                            // Use public API (no credentials needed for ticker)
                            const ticker = await adapter.getTicker(`${symbol}/USDT`);
                            valueUsd = amount * ticker.last;
                        }
                        catch {
                            // Can't price this asset, skip USD valuation
                        }
                    }
                    totalUsd += valueUsd;
                    await db.insert(exchangeAssets).values({
                        exchangeConnId: connection.id,
                        symbol,
                        name: acct.currency?.name ?? symbol,
                        amount: String(amount),
                        valueUsd: String(valueUsd.toFixed(2)),
                    });
                }
                // Update total balance and account label
                await db
                    .update(exchangeConnections)
                    .set({
                    totalBalance: String(totalUsd.toFixed(2)),
                    accountLabel: `${provider} (${accounts.length} accounts)`,
                })
                    .where(eq(exchangeConnections.id, connection.id));
            }
        }
        catch (err) {
            console.warn(`Failed to fetch ${provider} account data:`, err.message);
        }
    }
    await sendNotification(userId, {
        type: 'system',
        title: 'Exchange Connected',
        body: `Your ${provider} account has been connected via OAuth.`,
    }).catch(() => { });
    return connection;
}
