import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { exchangeConnections, exchangeAssets, portfolioSnapshots } from '../db/schema/exchanges.js';
import { getPrice } from './price-sync.job.js';

const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

function isStablecoin(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase());
}

async function processPortfolioUpdate() {
  console.log('[PortfolioUpdate] Updating portfolio values...');

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

    // Track per-user totals for snapshots
    const userTotals = new Map<string, { totalValue: number; prevValue: number; assetCount: number }>();

    for (const conn of connections) {
      try {
        const assets = await db
          .select()
          .from(exchangeAssets)
          .where(eq(exchangeAssets.exchangeConnId, conn.id));

        let totalBalance = 0;
        let assetCount = 0;

        for (const asset of assets) {
          const amount = parseFloat(asset.amount);

          // Skip zero-balance assets (will be hidden in UI)
          if (amount <= 0) {
            await db.update(exchangeAssets).set({ valueUsd: '0', allocation: '0', updatedAt: new Date() }).where(eq(exchangeAssets.id, asset.id));
            continue;
          }

          assetCount++;

          if (isStablecoin(asset.symbol)) {
            totalBalance += amount;
            await db.update(exchangeAssets).set({ valueUsd: amount.toFixed(2), change24h: '0', updatedAt: new Date() }).where(eq(exchangeAssets.id, asset.id));
            continue;
          }

          // Route price lookup by asset class
          const isStockConn = conn.assetClass === 'stocks';
          const priceSymbol = isStockConn ? asset.symbol.toUpperCase() : `${asset.symbol.toUpperCase()}/USDT`;
          const priceData = await getPrice(priceSymbol);
          if (!priceData) {
            totalBalance += parseFloat(asset.valueUsd ?? '0');
            continue;
          }

          const valueUsd = isStockConn ? amount * priceData.price : amount * priceData.price;
          totalBalance += valueUsd;

          await db.update(exchangeAssets).set({
            valueUsd: valueUsd.toFixed(2),
            change24h: priceData.change24h.toFixed(4),
            updatedAt: new Date(),
          }).where(eq(exchangeAssets.id, asset.id));
        }

        // Update connection total
        await db.update(exchangeConnections).set({
          totalBalance: totalBalance.toFixed(2),
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(exchangeConnections.id, conn.id));

        // Recalculate allocation percentages
        if (totalBalance > 0) {
          const updatedAssets = await db.select().from(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
          for (const asset of updatedAssets) {
            const value = parseFloat(asset.valueUsd ?? '0');
            const allocation = (value / totalBalance) * 100;
            await db.update(exchangeAssets).set({ allocation: allocation.toFixed(2) }).where(eq(exchangeAssets.id, asset.id));
          }
        }

        // Aggregate per-user totals
        const existing = userTotals.get(conn.userId) ?? { totalValue: 0, prevValue: 0, assetCount: 0 };
        existing.totalValue += totalBalance;
        existing.prevValue += parseFloat(conn.totalBalance ?? '0');
        existing.assetCount += assetCount;
        userTotals.set(conn.userId, existing);

        console.log(`[PortfolioUpdate] Connection ${conn.id}: $${totalBalance.toFixed(2)} (${assetCount} assets)`);
      } catch (err: any) {
        console.error(`[PortfolioUpdate] Error updating connection ${conn.id}:`, err.message);
      }
    }

    // Save daily snapshots (one per user per day)
    await saveDailySnapshots(userTotals);

  } catch (err: any) {
    console.error('[PortfolioUpdate] Error:', err.message);
  }
}

async function saveDailySnapshots(userTotals: Map<string, { totalValue: number; prevValue: number; assetCount: number }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const [userId, data] of userTotals.entries()) {
    try {
      const change = data.totalValue - data.prevValue;
      const changePercent = data.prevValue > 0 ? (change / data.prevValue) * 100 : 0;

      // Upsert: one snapshot per user per day
      const [existing] = await db.select({ id: portfolioSnapshots.id })
        .from(portfolioSnapshots)
        .where(and(
          eq(portfolioSnapshots.userId, userId),
          sql`date_trunc('day', ${portfolioSnapshots.date}) = ${today.toISOString()}::timestamptz`,
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
          date: today,
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

export async function startPortfolioUpdateJob() {
  // Run once after 30s (let price sync populate first)
  setTimeout(processPortfolioUpdate, 30_000);
  // Then every 5 minutes
  setInterval(processPortfolioUpdate, 300_000);
  console.log('[PortfolioUpdate] Job started - runs every 5 minutes');
}

/**
 * Trigger immediate portfolio refresh for a specific user (call after trades)
 */
export async function refreshUserPortfolio(userId: string) {
  const connections = await db.select().from(exchangeConnections)
    .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')));

  for (const conn of connections) {
    const assets = await db.select().from(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
    let totalBalance = 0;

    for (const asset of assets) {
      const amount = parseFloat(asset.amount);
      if (amount <= 0) continue;

      if (isStablecoin(asset.symbol)) {
        totalBalance += amount;
        continue;
      }

      const isStockConn = conn.assetClass === 'stocks';
      const pair = isStockConn ? asset.symbol.toUpperCase() : `${asset.symbol.toUpperCase()}/USDT`;
      const priceData = await getPrice(pair);
      if (priceData) {
        const valueUsd = amount * priceData.price;
        totalBalance += valueUsd;
        await db.update(exchangeAssets).set({
          valueUsd: valueUsd.toFixed(2),
          change24h: priceData.change24h.toFixed(4),
          updatedAt: new Date(),
        }).where(eq(exchangeAssets.id, asset.id));
      } else {
        totalBalance += parseFloat(asset.valueUsd ?? '0');
      }
    }

    await db.update(exchangeConnections).set({
      totalBalance: totalBalance.toFixed(2),
      lastSyncAt: new Date(),
    }).where(eq(exchangeConnections.id, conn.id));
  }
}
