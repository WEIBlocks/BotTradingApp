import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { exchangeConnections, exchangeAssets } from '../db/schema/exchanges';
import { getPrice } from './price-sync.job.js';

function symbolToTradingPair(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'USDT' || s === 'USD' || s === 'USDC' || s === 'BUSD') return '';
  return `${s}/USDT`;
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

    for (const conn of connections) {
      try {
        const assets = await db
          .select()
          .from(exchangeAssets)
          .where(eq(exchangeAssets.exchangeConnId, conn.id));

        let totalBalance = 0;

        for (const asset of assets) {
          const pair = symbolToTradingPair(asset.symbol);
          const amount = parseFloat(asset.amount);

          if (!pair) {
            const valueUsd = amount;
            totalBalance += valueUsd;
            await db
              .update(exchangeAssets)
              .set({ valueUsd: valueUsd.toFixed(2), change24h: '0', updatedAt: new Date() })
              .where(eq(exchangeAssets.id, asset.id));
            continue;
          }

          const priceData = await getPrice(pair);
          if (!priceData) continue;

          const valueUsd = amount * priceData.price;
          totalBalance += valueUsd;

          await db
            .update(exchangeAssets)
            .set({ valueUsd: valueUsd.toFixed(2), change24h: priceData.change24h.toFixed(4), updatedAt: new Date() })
            .where(eq(exchangeAssets.id, asset.id));
        }

        await db
          .update(exchangeConnections)
          .set({ totalBalance: totalBalance.toFixed(2), lastSyncAt: new Date(), updatedAt: new Date() })
          .where(eq(exchangeConnections.id, conn.id));

        if (totalBalance > 0) {
          const updatedAssets = await db
            .select()
            .from(exchangeAssets)
            .where(eq(exchangeAssets.exchangeConnId, conn.id));

          for (const asset of updatedAssets) {
            const value = parseFloat(asset.valueUsd ?? '0');
            const allocation = (value / totalBalance) * 100;
            await db
              .update(exchangeAssets)
              .set({ allocation: allocation.toFixed(2) })
              .where(eq(exchangeAssets.id, asset.id));
          }
        }

        console.log(`[PortfolioUpdate] Connection ${conn.id}: total $${totalBalance.toFixed(2)}`);
      } catch (err: any) {
        console.error(`[PortfolioUpdate] Error updating connection ${conn.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[PortfolioUpdate] Error:', err.message);
  }
}

export async function startPortfolioUpdateJob() {
  setInterval(processPortfolioUpdate, 300_000); // 5 minutes
  console.log('[PortfolioUpdate] Job started - runs every 5 minutes');
}
