import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { shadowSessions, bots } from '../db/schema/bots';
import { trades } from '../db/schema/trades';
import { activityLog } from '../db/schema/training';
import { getPrice, isUSMarketOpen } from './price-sync.job.js';
import { processSymbol } from '../lib/bot-engine.js';

interface BotConfig {
  pairs?: string[];
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  tradingMode?: string;
  tradeDirection?: 'buy' | 'sell' | 'both';
  dailyLossLimit?: number;
  orderType?: 'market' | 'limit';
}

async function processShadowTrades() {
  console.log('[ShadowTrade] Processing active shadow sessions...');

  try {
    const activeSessions = await db
      .select({ session: shadowSessions, bot: bots })
      .from(shadowSessions)
      .innerJoin(bots, eq(shadowSessions.botId, bots.id))
      .where(eq(shadowSessions.status, 'running'));

    if (activeSessions.length === 0) {
      console.log('[ShadowTrade] No active shadow sessions');
      return;
    }

    console.log(`[ShadowTrade] Processing ${activeSessions.length} active sessions`);

    for (const { session, bot } of activeSessions) {
      try {
        // Check expiry
        if (new Date() >= new Date(session.endsAt)) {
          await db.update(shadowSessions).set({ status: 'completed' }).where(eq(shadowSessions.id, session.id));
          console.log(`[ShadowTrade] Session ${session.id} completed (expired)`);
          continue;
        }

        const config = (bot.config ?? {}) as BotConfig;
        const isStockBot = bot.category === 'Stocks';
        const defaultPairs = isStockBot ? ['AAPL'] : ['BTC/USDT', 'ETH/USDT'];
        const pairs = config.pairs?.length ? config.pairs : defaultPairs;

        // Skip stock bots when US market is closed
        if (isStockBot) {
          const marketOpen = await isUSMarketOpen();
          if (!marketOpen) {
            console.log(`[ShadowTrade] Skipping ${bot.name} — US stock market closed`);
            continue;
          }
        }
        const currentBalance = parseFloat(session.currentBalance ?? session.virtualBalance);
        const feeRate = session.enableRealisticFees ? 0.001 : 0;

        // Pre-fetch fresh prices for all pairs (ensures cache is warm)
        for (const pair of pairs) {
          await getPrice(pair);
        }

        let balanceDelta = 0;
        let newTrades = 0;
        let newWins = 0;

        for (const pair of pairs) {
          const priceData = await getPrice(pair);
          if (!priceData) continue;

          // Use the AI-powered hybrid engine
          const decision = await processSymbol({
            sessionKey: `shadow:${session.id}`,
            symbol: pair,
            botId: bot.id,
            userId: session.userId,
            botPrompt: bot.prompt ?? '',
            strategy: bot.strategy,
            riskLevel: bot.riskLevel ?? 'Med',
            balance: currentBalance,
            stopLoss: config.stopLoss,
            takeProfit: config.takeProfit,
            maxPositionPct: config.maxPositionSize ? config.maxPositionSize / 100 : 20,
            tradeDirection: config.tradeDirection ?? 'both',
            dailyLossLimit: config.dailyLossLimit ?? 0,
            mode: 'paper',
            shadowSessionId: session.id,
          });

          if (decision.action === 'HOLD') continue;

          // Calculate trade values
          const positionValue = currentBalance * (decision.sizePercent ?? 20) / 100;
          const amount = positionValue / priceData.price;
          const totalValue = amount * priceData.price;
          const fee = totalValue * feeRate;
          let pnl: number | null = null;
          let pnlPercent: number | null = null;

          if (decision.action === 'SELL') {
            pnl = totalValue - fee;
            // Extract P&L from reasoning
            const pnlMatch = decision.reasoning.match(/([\-+]?\d+\.?\d*)%/);
            if (pnlMatch) {
              pnlPercent = parseFloat(pnlMatch[1]);
            }
            balanceDelta += pnl;
            if (pnl > 0) newWins++;
          } else {
            balanceDelta -= (totalValue + fee);
          }

          await db.insert(trades).values({
            userId: session.userId,
            shadowSessionId: session.id,
            symbol: pair,
            side: decision.action,
            amount: amount.toFixed(8),
            price: priceData.price.toFixed(8),
            totalValue: totalValue.toFixed(2),
            pnl: pnl !== null ? pnl.toFixed(2) : null,
            pnlPercent: pnlPercent !== null ? pnlPercent.toFixed(4) : null,
            isPaper: true,
            reasoning: decision.reasoning,
            status: 'filled',
          });

          newTrades++;
        }

        // Update session balance
        const updatedBalance = currentBalance + balanceDelta;
        const dailyPerf = (session.dailyPerformance as Record<string, any>) ?? {};
        const today = new Date().toISOString().split('T')[0];

        if (!dailyPerf[today]) {
          dailyPerf[today] = { trades: 0, pnl: 0, balance: updatedBalance };
        }
        dailyPerf[today].trades += newTrades;
        dailyPerf[today].pnl += balanceDelta;
        dailyPerf[today].balance = updatedBalance;

        await db
          .update(shadowSessions)
          .set({
            currentBalance: updatedBalance.toFixed(2),
            dailyPerformance: dailyPerf,
            totalTrades: sql`COALESCE(${shadowSessions.totalTrades}, 0) + ${newTrades}`,
            winCount: sql`COALESCE(${shadowSessions.winCount}, 0) + ${newWins}`,
          })
          .where(eq(shadowSessions.id, session.id));

        if (newTrades > 0) {
          console.log(`[ShadowTrade] Session ${session.id}: ${newTrades} trades, balance: $${updatedBalance.toFixed(2)}`);
          const pnlType = balanceDelta >= 0 ? 'profit' : 'fee';
          try {
            await db.insert(activityLog).values({
              userId: session.userId,
              type: pnlType as any,
              title: `Shadow Trade — ${bot.name}`,
              subtitle: `${newTrades} trade${newTrades > 1 ? 's' : ''} executed`,
              amount: balanceDelta.toFixed(2),
            });
          } catch {}
        }
      } catch (err: any) {
        console.error(`[ShadowTrade] Error processing session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[ShadowTrade] Error:', err.message);
  }
}

export async function startShadowTradeJob() {
  // Run once immediately after a short delay (let prices sync first)
  setTimeout(processShadowTrades, 10_000);
  // Then every 2 minutes
  setInterval(processShadowTrades, 120_000);
  console.log('[ShadowTrade] Job started - runs every 2 minutes (AI-powered hybrid engine)');
}
