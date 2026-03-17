import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { exchangeConnections, exchangeAssets } from '../../db/schema/exchanges.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { NotFoundError, AppError } from '../../lib/errors.js';
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

export async function connectWithApiKey(
  userId: string,
  provider: string,
  apiKey: string,
  apiSecret: string,
  sandbox = false,
) {
  // Use adapter to test connection with the real exchange
  let adapter;
  try {
    adapter = createAdapter(provider);
  } catch {
    // Unsupported adapter; fall back to storing without test
    adapter = null;
  }

  if (adapter) {
    await adapter.connect({ apiKey, apiSecret, sandbox });
    const success = await adapter.testConnection();
    if (!success) {
      await adapter.disconnect();
      await sendNotification(userId, {
        type: 'alert',
        title: 'Exchange Connection Failed',
        body: `Could not connect to ${provider}. Please verify your API credentials.`,
        priority: 'high',
      }).catch(() => {});
      throw new AppError(400, `Failed to connect to ${provider}. Please check your API credentials.`);
    }
  }

  // Encrypt credentials
  const apiKeyEnc = encrypt(apiKey);
  const apiSecretEnc = encrypt(apiSecret);

  const [connection] = await db
    .insert(exchangeConnections)
    .values({
      userId,
      provider,
      method: 'api_key',
      apiKeyEnc,
      apiSecretEnc,
      sandbox,
      status: 'connected',
      lastSyncAt: new Date(),
    })
    .returning();

  // Fetch initial balances and create exchange_assets records
  if (adapter) {
    try {
      const balances = await adapter.getBalances();
      let totalUsd = 0;

      for (const bal of balances) {
        let valueUsd = 0;
        try {
          if (bal.currency === 'USDT' || bal.currency === 'USDC' || bal.currency === 'USD' || bal.currency === 'BUSD') {
            valueUsd = bal.total;
          } else {
            const ticker = await adapter.getTicker(`${bal.currency}/USDT`);
            valueUsd = bal.total * ticker.last;
          }
        } catch {
          // Could not fetch ticker, leave valueUsd as 0
        }

        totalUsd += valueUsd;

        await db.insert(exchangeAssets).values({
          exchangeConnId: connection.id,
          symbol: bal.currency,
          amount: String(bal.total),
          valueUsd: String(valueUsd.toFixed(2)),
        });
      }

      // Update totalBalance on the connection
      await db
        .update(exchangeConnections)
        .set({ totalBalance: String(totalUsd.toFixed(2)) })
        .where(eq(exchangeConnections.id, connection.id));

      await adapter.disconnect();
    } catch (err) {
      console.warn('Failed to fetch initial balances:', (err as Error).message);
      await adapter.disconnect().catch(() => {});
    }
  }

  await sendNotification(userId, {
    type: 'system',
    title: 'Exchange Connected',
    body: `Your ${provider} account has been connected successfully.`,
  }).catch(() => {});

  return connection;
}

export async function testConnection(
  provider: string,
  apiKey: string,
  apiSecret: string,
  sandbox = false,
) {
  let adapter;
  try {
    adapter = createAdapter(provider);
  } catch {
    throw new AppError(400, `Unsupported exchange: ${provider}`);
  }

  try {
    await adapter.connect({ apiKey, apiSecret, sandbox });
    const success = await adapter.testConnection();
    await adapter.disconnect();

    if (!success) {
      throw new AppError(400, `Failed to connect to ${provider}. Please check your API credentials.`);
    }

    return { success: true, provider, message: `Successfully connected to ${provider}!` };
  } catch (err) {
    await adapter.disconnect().catch(() => {});
    if (err instanceof AppError) throw err;
    throw new AppError(400, `Failed to connect to ${provider}. Please verify your API key and secret.`);
  }
}

export async function getUserConnections(userId: string) {
  const connections = await db
    .select({
      id: exchangeConnections.id,
      provider: exchangeConnections.provider,
      method: exchangeConnections.method,
      status: exchangeConnections.status,
      sandbox: exchangeConnections.sandbox,
      accountLabel: exchangeConnections.accountLabel,
      totalBalance: exchangeConnections.totalBalance,
      lastSyncAt: exchangeConnections.lastSyncAt,
      errorMessage: exchangeConnections.errorMessage,
      createdAt: exchangeConnections.createdAt,
    })
    .from(exchangeConnections)
    .where(eq(exchangeConnections.userId, userId));

  return connections;
}

export async function resync(connectionId: string, userId: string) {
  // Set status to syncing
  const [conn] = await db
    .update(exchangeConnections)
    .set({ status: 'syncing', updatedAt: new Date() })
    .where(
      and(
        eq(exchangeConnections.id, connectionId),
        eq(exchangeConnections.userId, userId),
      ),
    )
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

    const apiKey = decrypt(conn.apiKeyEnc);
    const apiSecret = decrypt(conn.apiSecretEnc);

    adapter = createAdapter(conn.provider);
    await adapter.connect({ apiKey, apiSecret, sandbox: conn.sandbox ?? false });

    const balances = await adapter.getBalances();

    // Delete old assets and insert fresh data
    await db
      .delete(exchangeAssets)
      .where(eq(exchangeAssets.exchangeConnId, connectionId));

    let totalUsd = 0;

    for (const bal of balances) {
      let valueUsd = 0;
      try {
        if (bal.currency === 'USDT' || bal.currency === 'USDC' || bal.currency === 'USD' || bal.currency === 'BUSD') {
          valueUsd = bal.total;
        } else {
          const ticker = await adapter.getTicker(`${bal.currency}/USDT`);
          valueUsd = bal.total * ticker.last;
        }
      } catch {
        // Could not fetch ticker
      }

      totalUsd += valueUsd;

      await db.insert(exchangeAssets).values({
        exchangeConnId: connectionId,
        symbol: bal.currency,
        amount: String(bal.total),
        valueUsd: String(valueUsd.toFixed(2)),
      });
    }

    await adapter.disconnect();

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
  } catch (err) {
    if (adapter) await adapter.disconnect().catch(() => {});

    // Mark as error
    const [result] = await db
      .update(exchangeConnections)
      .set({
        status: 'error',
        errorMessage: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(exchangeConnections.id, connectionId))
      .returning();

    return result;
  }
}

export async function disconnect(connectionId: string, userId: string) {
  // Delete associated assets first (cascade should handle this, but be explicit)
  await db
    .delete(exchangeAssets)
    .where(eq(exchangeAssets.exchangeConnId, connectionId));

  const [deleted] = await db
    .delete(exchangeConnections)
    .where(
      and(
        eq(exchangeConnections.id, connectionId),
        eq(exchangeConnections.userId, userId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new NotFoundError('Exchange connection');
  }

  return deleted;
}

// ─── OAuth Configuration ─────────────────────────────────────────────────────

interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  accountUrl?: string;
}

function getOAuthConfig(provider: string): OAuthProviderConfig {
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

export async function initiateOAuth(provider: string) {
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

export async function handleOAuthCallback(
  provider: string,
  code: string,
  userId: string,
) {
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
    throw new AppError(
      400,
      `OAuth token exchange failed for ${provider}: ${errBody}`,
      'OAUTH_TOKEN_ERROR',
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };

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
        const accountData = (await accountResponse.json()) as {
          data?: Array<{
            name?: string;
            balance?: { amount?: string; currency?: string };
            currency?: { code?: string; name?: string };
          }>;
        };

        let totalUsd = 0;
        const accounts = accountData.data ?? [];

        for (const acct of accounts) {
          const amount = parseFloat(acct.balance?.amount ?? '0');
          if (amount <= 0) continue;

          const symbol = acct.currency?.code ?? acct.balance?.currency ?? 'UNKNOWN';

          // For stablecoins, value = amount. For others, we'd need price lookup.
          let valueUsd = 0;
          if (['USD', 'USDT', 'USDC', 'BUSD'].includes(symbol)) {
            valueUsd = amount;
          } else {
            // Attempt price fetch via ccxt adapter if available
            try {
              const adapter = createAdapter('binance');
              // Use public API (no credentials needed for ticker)
              const ticker = await adapter.getTicker(`${symbol}/USDT`);
              valueUsd = amount * ticker.last;
            } catch {
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
    } catch (err) {
      console.warn(`Failed to fetch ${provider} account data:`, (err as Error).message);
    }
  }

  await sendNotification(userId, {
    type: 'system',
    title: 'Exchange Connected',
    body: `Your ${provider} account has been connected via OAuth.`,
  }).catch(() => {});

  return connection;
}
