import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { createQueue, createWorker } from '../config/queue.js';
import { exchangeConnections, exchangeAssets } from '../db/schema/exchanges';
import { getPrice } from './price-sync.job.js';

const portfolioQueue = createQueue('portfolio-update');

// Map common asset symbols to trading pairs
function symbolToTradingPair(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'USDT' || s === 'USD' || s === 'USDC' || s === 'BUSD') {
    return ''; // stablecoins, no price lookup needed
  }
  return `${s}/USDT`;
}

async function processPortfolioUpdate() {
  console.log('[PortfolioUpdate] Updating portfolio values...');

  try {
    // Get all connected exchange connections
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
        // Get assets for this connection
        const assets = await db
          .select()
          .from(exchangeAssets)
          .where(eq(exchangeAssets.exchangeConnId, conn.id));

        let totalBalance = 0;

        for (const asset of assets) {
          const pair = symbolToTradingPair(asset.symbol);
          const amount = parseFloat(asset.amount);

          if (!pair) {
            // Stablecoin: value = amount
            const valueUsd = amount;
            totalBalance += valueUsd;

            await db
              .update(exchangeAssets)
              .set({
                valueUsd: valueUsd.toFixed(2),
                change24h: '0',
                updatedAt: new Date(),
              })
              .where(eq(exchangeAssets.id, asset.id));
            continue;
          }

          const priceData = await getPrice(pair);
          if (!priceData) continue;

          const valueUsd = amount * priceData.price;
          totalBalance += valueUsd;

          await db
            .update(exchangeAssets)
            .set({
              valueUsd: valueUsd.toFixed(2),
              change24h: priceData.change24h.toFixed(4),
              updatedAt: new Date(),
            })
            .where(eq(exchangeAssets.id, asset.id));
        }

        // Update total balance on connection
        await db
          .update(exchangeConnections)
          .set({
            totalBalance: totalBalance.toFixed(2),
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(exchangeConnections.id, conn.id));

        // Update allocation percentages
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
  const existing = await portfolioQueue.getRepeatableJobs();
  for (const job of existing) {
    await portfolioQueue.removeRepeatableByKey(job.key);
  }

  await portfolioQueue.add(
    'update-portfolios',
    {},
    {
      repeat: { every: 300_000 }, // 5 minutes
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 10 },
    },
  );

  createWorker('portfolio-update', async () => {
    await processPortfolioUpdate();
  });

  console.log('[PortfolioUpdate] Job started - runs every 5 minutes');
}
