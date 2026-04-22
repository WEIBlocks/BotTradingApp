import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { exchangeConnections, exchangeAssets, portfolioSnapshots } from '../db/schema/exchanges.js';
import { decrypt } from '../lib/encryption.js';
import { createAdapter } from '../modules/exchange/adapters/adapter.factory.js';

const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

// ─── Core: Sync real balances from exchange ──────────────────────────────────

/**
 * Fetches live balances from the exchange API, updates exchange_assets rows,
 * and updates the connection's totalBalance. Returns the new total in USD.
 */
async function syncConnectionBalances(conn: typeof exchangeConnections.$inferSelect): Promise<number> {
  if (!conn.apiKeyEnc || !conn.apiSecretEnc) {
    // No credentials (e.g. OAuth placeholder) — fall back to repricing only
    return repriceCachedAssets(conn);
  }

  // Guard: legacy or corrupted encrypted values fail with "Invalid authentication tag length"
  // Safely attempt decrypt — if it fails, mark connection as needing re-auth and fall back
  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(conn.apiKeyEnc);
    apiSecret = decrypt(conn.apiSecretEnc);
  } catch (decryptErr: any) {
    console.warn(`[PortfolioUpdate] Decryption failed for ${conn.provider} connection ${conn.id.slice(0, 8)}: ${decryptErr.message} — credentials need re-entering`);
    await db.update(exchangeConnections).set({
      status: 'error',
      errorMessage: 'Credentials need to be re-entered (encryption key changed)',
      updatedAt: new Date(),
    }).where(eq(exchangeConnections.id, conn.id)).catch(() => {});
    return repriceCachedAssets(conn);
  }

  // Binance's authenticated API (api.binance.com) is geo-blocked on DigitalOcean NYC (HTTP 451).
  // The live trade engine uses ccxt with KuCoin market pre-population to bypass public API geo-block,
  // but fetchBalance hits the authenticated endpoint which is also blocked from this region.
  // Skip live balance fetch for Binance — reprice cached assets instead.
  // Users can resync manually from the app (which goes through user-triggered path, not this server job).
  if (conn.provider.toLowerCase() === 'binance' && !conn.sandbox) {
    return repriceCachedAssets(conn);
  }

  let adapter;
  try {
    adapter = createAdapter(conn.provider);
    await adapter.connect({ apiKey, apiSecret, sandbox: conn.sandbox ?? false });

    const balances = await adapter.getBalances();
    const isStockConn = conn.assetClass === 'stocks';

    // Filter to non-zero entries
    const nonZero = balances.filter(b => b.total > 0 || b.free > 0);

    // For crypto: batch-fetch all tickers at once to avoid N×200ms serial calls
    const priceMap = new Map<string, number>(); // currency → USD price
    if (!isStockConn && adapter.getTickers) {
      const cryptoSymbols = nonZero
        .map(b => `${b.currency.toUpperCase()}/USDT`)
        .filter(s => !STABLECOINS.has(s.replace('/USDT', '')));

      if (cryptoSymbols.length > 0) {
        const fetched = await adapter.getTickers(cryptoSymbols).catch(() => new Map<string, number>());
        for (const [k, v] of fetched) priceMap.set(k, v);
      }
    }

    await adapter.disconnect().catch(() => {});

    let totalUsd = 0;

    // Build all rows in memory first
    const rows: { exchangeConnId: string; symbol: string; amount: string; valueUsd: string; change24h: string; allocation: string }[] = [];

    for (const bal of nonZero) {
      const sym = bal.currency.toUpperCase();
      let valueUsd = 0;

      if (STABLECOINS.has(sym)) {
        valueUsd = bal.total;
      } else if (isStockConn) {
        valueUsd = bal.total;
      } else {
        const price = priceMap.get(sym);
        if (price) valueUsd = bal.total * price;
      }

      totalUsd += valueUsd;

      const assetAmount = isStockConn && !STABLECOINS.has(sym) ? bal.free : bal.total;
      rows.push({
        exchangeConnId: conn.id,
        symbol: bal.currency,
        amount: String(assetAmount),
        valueUsd: valueUsd.toFixed(2),
        change24h: '0',
        allocation: '0',
      });
    }

    // Compute allocation % in memory
    if (totalUsd > 0) {
      for (const row of rows) {
        row.allocation = ((parseFloat(row.valueUsd) / totalUsd) * 100).toFixed(2);
      }
    }

    // Delete stale rows then bulk insert in one query
    await db.delete(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
    if (rows.length > 0) {
      // Drizzle bulk insert: split into chunks of 500 to stay within PG parameter limit
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(exchangeAssets).values(rows.slice(i, i + CHUNK) as any);
      }
    }

    await db.update(exchangeConnections).set({
      totalBalance: totalUsd.toFixed(2),
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(exchangeConnections.id, conn.id));

    console.log(`[PortfolioUpdate] Synced ${conn.provider} (${conn.sandbox ? 'testnet' : 'live'}): $${totalUsd.toFixed(2)}`);
    return totalUsd;

  } catch (err: any) {
    if (adapter) await adapter.disconnect().catch(() => {});
    console.warn(`[PortfolioUpdate] Exchange fetch failed for ${conn.provider}: ${err.message} — falling back to reprice`);
    return repriceCachedAssets(conn);
  }
}

/**
 * Fallback: reprice existing asset rows using cached prices (no exchange API call).
 */
async function repriceCachedAssets(conn: typeof exchangeConnections.$inferSelect): Promise<number> {
  const { getPrice } = await import('./price-sync.job.js');
  const assets = await db.select().from(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
  const isStockConn = conn.assetClass === 'stocks';
  let totalBalance = 0;

  for (const asset of assets) {
    const amount = parseFloat(asset.amount);
    if (amount <= 0) continue;

    if (STABLECOINS.has(asset.symbol.toUpperCase())) {
      totalBalance += amount;
      await db.update(exchangeAssets).set({ valueUsd: amount.toFixed(2), change24h: '0', updatedAt: new Date() }).where(eq(exchangeAssets.id, asset.id));
      continue;
    }

    const priceSymbol = isStockConn ? asset.symbol.toUpperCase() : `${asset.symbol.toUpperCase()}/USDT`;
    const priceData = await getPrice(priceSymbol);
    if (!priceData) {
      totalBalance += parseFloat(asset.valueUsd ?? '0');
      continue;
    }
    const valueUsd = amount * priceData.price;
    totalBalance += valueUsd;
    await db.update(exchangeAssets).set({
      valueUsd: valueUsd.toFixed(2),
      change24h: priceData.change24h.toFixed(4),
      updatedAt: new Date(),
    }).where(eq(exchangeAssets.id, asset.id));
  }

  if (totalBalance > 0) {
    const allAssets = await db.select().from(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
    for (const a of allAssets) {
      const alloc = (parseFloat(a.valueUsd ?? '0') / totalBalance) * 100;
      await db.update(exchangeAssets).set({ allocation: alloc.toFixed(2) }).where(eq(exchangeAssets.id, a.id));
    }
  }

  await db.update(exchangeConnections).set({
    totalBalance: totalBalance.toFixed(2),
    lastSyncAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(exchangeConnections.id, conn.id));

  return totalBalance;
}

// ─── Scheduled Portfolio Update Job ─────────────────────────────────────────

async function processPortfolioUpdate() {
  console.log('[PortfolioUpdate] Syncing balances from exchanges...');

  try {
    const connections = await db
      .select()
      .from(exchangeConnections)
      .where(eq(exchangeConnections.status, 'connected'));

    if (connections.length === 0) {
      console.log('[PortfolioUpdate] No connected exchanges');
      return;
    }

    console.log(`[PortfolioUpdate] Processing ${connections.length} exchange connections`);

    const userTotals = new Map<string, { totalValue: number; prevValue: number; assetCount: number }>();

    for (const conn of connections) {
      try {
        const prevBalance = parseFloat(conn.totalBalance ?? '0');
        const newBalance = await syncConnectionBalances(conn);
        const assetCount = await db.select().from(exchangeAssets)
          .where(eq(exchangeAssets.exchangeConnId, conn.id))
          .then(r => r.length);

        const existing = userTotals.get(conn.userId) ?? { totalValue: 0, prevValue: 0, assetCount: 0 };
        existing.totalValue += newBalance;
        existing.prevValue += prevBalance;
        existing.assetCount += assetCount;
        userTotals.set(conn.userId, existing);
      } catch (err: any) {
        console.error(`[PortfolioUpdate] Error for connection ${conn.id}:`, err.message);
      }
    }

    await saveDailySnapshots(userTotals);
    await saveHourlySnapshots(userTotals);

  } catch (err: any) {
    console.error('[PortfolioUpdate] Error:', err.message);
  }
}

async function saveDailySnapshots(userTotals: Map<string, { totalValue: number; prevValue: number; assetCount: number }>) {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // 24h ago for true daily change
  const oneDayAgoUTC = new Date(todayUTC.getTime() - 86400_000);

  for (const [userId, data] of userTotals.entries()) {
    try {
      // Compute true 24h change by comparing to the snapshot closest to 24h ago
      const [dayAgoSnap] = await db
        .select({ totalValue: portfolioSnapshots.totalValue })
        .from(portfolioSnapshots)
        .where(and(
          eq(portfolioSnapshots.userId, userId),
          sql`COALESCE(portfolio_snapshots.granularity, 'daily') = 'daily'`,
          sql`${portfolioSnapshots.date} <= ${oneDayAgoUTC.toISOString()}::timestamptz`,
        ))
        .orderBy(sql`${portfolioSnapshots.date} DESC`)
        .limit(1);

      const baseValue = dayAgoSnap ? parseFloat(dayAgoSnap.totalValue) : data.prevValue;
      const change = data.totalValue - baseValue;
      const changePercent = baseValue > 0 ? (change / baseValue) * 100 : 0;

      // Upsert: one snapshot per user per UTC day
      const [existing] = await db.select({ id: portfolioSnapshots.id })
        .from(portfolioSnapshots)
        .where(and(
          eq(portfolioSnapshots.userId, userId),
          sql`COALESCE(portfolio_snapshots.granularity, 'daily') = 'daily'`,
          sql`date_trunc('day', ${portfolioSnapshots.date} AT TIME ZONE 'UTC') = ${todayUTC.toISOString()}::timestamptz`,
        ))
        .limit(1);

      if (existing) {
        await db.update(portfolioSnapshots).set({
          totalValue: data.totalValue.toFixed(2),
          change24h: change.toFixed(2),
          changePercent: changePercent.toFixed(4),
          assetCount: data.assetCount,
        }).where(eq(portfolioSnapshots.id, existing.id));
      } else {
        await db.insert(portfolioSnapshots).values({
          userId,
          date: todayUTC,
          totalValue: data.totalValue.toFixed(2),
          change24h: change.toFixed(2),
          changePercent: changePercent.toFixed(4),
          assetCount: data.assetCount,
        });
      }
    } catch (err: any) {
      console.error(`[PortfolioUpdate] Snapshot error for ${userId}:`, err.message);
    }
  }
}

async function saveHourlySnapshots(userTotals: Map<string, { totalValue: number; prevValue: number; assetCount: number }>) {
  const now = new Date();
  const hourUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  // 24h ago for hourly change_24h column (still shows 24h diff for consistency with daily)
  const oneDayAgoUTC = new Date(hourUTC.getTime() - 86400_000);

  for (const [userId, data] of userTotals.entries()) {
    try {
      const [dayAgoSnap] = await db
        .select({ totalValue: portfolioSnapshots.totalValue })
        .from(portfolioSnapshots)
        .where(and(
          eq(portfolioSnapshots.userId, userId),
          sql`${portfolioSnapshots.date} <= ${oneDayAgoUTC.toISOString()}::timestamptz`,
        ))
        .orderBy(sql`${portfolioSnapshots.date} DESC`)
        .limit(1);

      const baseValue = dayAgoSnap ? parseFloat(dayAgoSnap.totalValue) : data.prevValue;
      const change = data.totalValue - baseValue;
      const changePercent = baseValue > 0 ? (change / baseValue) * 100 : 0;

      // Upsert: one hourly snapshot per user per UTC hour
      const [existing] = await db.select({ id: portfolioSnapshots.id })
        .from(portfolioSnapshots)
        .where(and(
          eq(portfolioSnapshots.userId, userId),
          sql`COALESCE(portfolio_snapshots.granularity, 'daily') = 'hourly'`,
          sql`date_trunc('hour', ${portfolioSnapshots.date} AT TIME ZONE 'UTC') = ${hourUTC.toISOString()}::timestamptz`,
        ))
        .limit(1);

      if (existing) {
        await db.update(portfolioSnapshots).set({
          totalValue: data.totalValue.toFixed(2),
          change24h: change.toFixed(2),
          changePercent: changePercent.toFixed(4),
          assetCount: data.assetCount,
        }).where(eq(portfolioSnapshots.id, existing.id));
      } else {
        await db.insert(portfolioSnapshots).values({
          userId,
          date: hourUTC,
          totalValue: data.totalValue.toFixed(2),
          change24h: change.toFixed(2),
          changePercent: changePercent.toFixed(4),
          assetCount: data.assetCount,
          granularity: 'hourly',
        } as any);
      }
    } catch (err: any) {
      console.error(`[PortfolioUpdate] Hourly snapshot error for ${userId}:`, err.message);
    }
  }
}

export async function startPortfolioUpdateJob() {
  // Run once after 30s (let price sync populate first)
  setTimeout(processPortfolioUpdate, 30_000);
  // Then every 5 minutes
  setInterval(processPortfolioUpdate, 300_000);
  console.log('[PortfolioUpdate] Job started - runs every 5 minutes');
}

/**
 * Trigger immediate portfolio refresh for a specific user (called after every live trade).
 * Fetches real balances, saves snapshot, then publishes a portfolio_update event to Redis
 * so the /ws/app WebSocket can push it to the mobile client instantly.
 */
export async function refreshUserPortfolio(userId: string) {
  try {
    const connections = await db.select().from(exchangeConnections)
      .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')));

    let totalValue = 0;
    for (const conn of connections) {
      totalValue += await syncConnectionBalances(conn);
    }

    // Fetch the last 30 daily equity snapshots for the updated curve
    const snapshots = await db
      .select({ totalValue: portfolioSnapshots.totalValue, date: portfolioSnapshots.date })
      .from(portfolioSnapshots)
      .where(and(
        eq(portfolioSnapshots.userId, userId),
        sql`COALESCE(portfolio_snapshots.granularity, 'daily') = 'daily'`,
      ))
      .orderBy(sql`${portfolioSnapshots.date} DESC`)
      .limit(30);

    // Reverse so oldest→newest, then append current value
    const equityData = snapshots.reverse().map(s => parseFloat(s.totalValue));
    equityData.push(totalValue);

    // Publish to Redis so /ws/app handler fan-outs to the mobile client
    const { publishMessage } = await import('../config/redis.js');
    await publishMessage(`portfolio:equity:${userId}`, {
      equityData,
      newPoint:   totalValue,
      totalValue,
    });

  } catch (err: any) {
    console.warn('[PortfolioUpdate] refreshUserPortfolio error:', err.message);
  }
}
