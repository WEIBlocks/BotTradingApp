import { eq, sql, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { shadowSessions, bots, botSubscriptions } from '../db/schema/bots.js';
import { trades } from '../db/schema/trades.js';
import { activityLog } from '../db/schema/training.js';
import { botDecisions } from '../db/schema/decisions.js';
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
  tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
  maxHoldsBeforeAI?: number;
  aiConfidenceThreshold?: number;
  aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
  customEntryConditions?: any[];
  customExitConditions?: any[];
  maxOpenPositions?: number;
  tradingSchedule?: string;
}

interface UserConfig {
  riskMultiplier?: number;
  maxDailyLoss?: number;
  autoStopBalance?: number;
  autoStopDays?: number;
  autoStopLossPercent?: number;
  compoundProfits?: boolean;
  notificationLevel?: string;
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

        // Fetch subscriber overrides
        const [subRow] = await db
          .select({ userConfig: botSubscriptions.userConfig })
          .from(botSubscriptions)
          .where(and(
            eq(botSubscriptions.userId, session.userId),
            eq(botSubscriptions.botId, session.botId!),
          ))
          .limit(1);
        const userConfig = (subRow?.userConfig ?? {}) as UserConfig;

        const isStockBot = bot.category === 'Stocks';
        const defaultPairs = isStockBot ? ['AAPL'] : ['BTC/USDT', 'ETH/USDT'];
        const pairs = config.pairs?.length ? config.pairs : defaultPairs;

        // Skip stock bots when US market is closed — but log a HOLD so the live feed isn't empty
        if (isStockBot) {
          const marketOpen = await isUSMarketOpen();
          if (!marketOpen) {
            console.log(`[ShadowTrade] Skipping ${bot.name} — US stock market closed`);
            // Log a "market closed" HOLD at most once every 30 min per session (avoid feed flooding)
            const { redisConnection } = await import('../config/queue.js');
            const throttleKey = `market_closed_log:shadow:${session.id}`;
            const alreadyLogged = await redisConnection.get(throttleKey).catch(() => null);
            if (!alreadyLogged) {
              const firstPair = pairs[0] ?? 'AAPL';
              const priceData = await getPrice(firstPair).catch(() => null);
              await db.insert(botDecisions).values({
                botId: bot.id,
                userId: session.userId,
                shadowSessionId: session.id,
                symbol: firstPair,
                action: 'HOLD',
                confidence: 0,
                reasoning: 'US stock market is currently closed (9:30 AM – 4:00 PM ET on weekdays). Bot will resume when market opens.',
                indicators: {},
                price: priceData ? priceData.price.toFixed(4) : '0',
                aiCalled: false,
                tokensCost: 0,
                mode: 'paper',
              }).catch(() => {});
              await redisConnection.set(throttleKey, '1', 'EX', 1800).catch(() => {});
            }
            continue;
          }
        }
        const currentBalance = parseFloat(session.currentBalance ?? session.virtualBalance);

        // autoStopBalance
        if (userConfig.autoStopBalance !== undefined && currentBalance < userConfig.autoStopBalance) {
          await db.update(shadowSessions).set({ status: 'completed' }).where(eq(shadowSessions.id, session.id));
          console.log(`[ShadowTrade] Session ${session.id} stopped — balance below autoStop $${userConfig.autoStopBalance}`);
          continue;
        }
        // autoStopLossPercent
        if (userConfig.autoStopLossPercent !== undefined && userConfig.autoStopLossPercent > 0) {
          const startBalance = parseFloat(session.virtualBalance);
          const lossPercent = ((startBalance - currentBalance) / startBalance) * 100;
          if (lossPercent >= userConfig.autoStopLossPercent) {
            await db.update(shadowSessions).set({ status: 'completed' }).where(eq(shadowSessions.id, session.id));
            console.log(`[ShadowTrade] Session ${session.id} stopped — total loss ${lossPercent.toFixed(2)}% exceeds limit`);
            continue;
          }
        }
        // autoStopDays
        if (userConfig.autoStopDays !== undefined) {
          const daysSinceStart = (Date.now() - new Date(session.startedAt ?? Date.now()).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceStart >= userConfig.autoStopDays) {
            await db.update(shadowSessions).set({ status: 'completed' }).where(eq(shadowSessions.id, session.id));
            console.log(`[ShadowTrade] Session ${session.id} stopped — autoStopDays reached`);
            continue;
          }
        }
        // tradingSchedule: us_hours for non-stock bots (stock bots handled above)
        if (config.tradingSchedule === 'us_hours' && !isStockBot) {
          const marketOpen = await isUSMarketOpen();
          if (!marketOpen) {
            console.log(`[ShadowTrade] Skipping ${bot.name} — tradingSchedule=us_hours`);
            continue;
          }
        }
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
            maxPositionPct: config.maxPositionSize ?? 20,
            tradeDirection: config.tradeDirection ?? 'both',
            dailyLossLimit: userConfig.maxDailyLoss ?? config.dailyLossLimit ?? 0,
            mode: 'paper',
            shadowSessionId: session.id,
            aiMode: config.aiMode,
            aiConfidenceThreshold: config.aiConfidenceThreshold,
            maxHoldsBeforeAI: config.maxHoldsBeforeAI,
            tradingFrequency: config.tradingFrequency,
            customEntryConditions: config.customEntryConditions,
            customExitConditions: config.customExitConditions,
            maxOpenPositions: config.maxOpenPositions,
            riskMultiplier: userConfig.riskMultiplier,
          });

          if (decision.action === 'HOLD') continue;

          // Calculate trade values
          // Use session's user-configured minimum order value; fallback to $10
          const sessionMinOrder = parseFloat((session as any).minOrderValue ?? '10') || 10;
          const sizePercent = decision.sizePercent && decision.sizePercent > 0 ? decision.sizePercent : 20;
          const rawPositionValue = currentBalance * sizePercent / 100;
          const positionValue = Math.max(rawPositionValue, sessionMinOrder);
          const amount = positionValue / priceData.price;
          const totalValue = amount * priceData.price;

          // Skip if amount rounds to zero (price data issue)
          if (amount <= 0 || totalValue <= 0) continue;

          // Sanity cap: position value must not exceed current balance
          const cappedPositionValue = Math.min(positionValue, currentBalance * 0.5);
          const cappedAmount = cappedPositionValue / priceData.price;
          const cappedTotal = cappedAmount * priceData.price;
          if (cappedTotal <= 0) continue;

          const fee = cappedTotal * feeRate;
          let pnl: number | null = null;
          let pnlPercent: number | null = null;

          if (decision.action === 'SELL') {
            // Extract P&L % from reasoning to compute realistic profit
            const pnlMatch = decision.reasoning.match(/([\-+]?\d+\.?\d*)%/);
            if (pnlMatch) {
              pnlPercent = parseFloat(pnlMatch[1]);
            }
            // PnL = position value × return% (capped at ±50% per trade to prevent runaway)
            const returnPct = Math.max(-0.5, Math.min(0.5, (pnlPercent ?? 2) / 100));
            pnl = cappedTotal * returnPct - fee;
            balanceDelta += pnl;
            if (pnl > 0) newWins++;
          } else {
            // BUY: deduct fee only — position is "held", not settled yet
            balanceDelta -= fee;
            pnl = -fee;
          }

          await db.insert(trades).values({
            userId: session.userId,
            shadowSessionId: session.id,
            symbol: pair,
            side: decision.action,
            amount: cappedAmount.toFixed(8),
            price: priceData.price.toFixed(8),
            totalValue: cappedTotal.toFixed(2),
            pnl: pnl !== null ? pnl.toFixed(2) : null,
            pnlPercent: pnlPercent !== null ? pnlPercent.toFixed(4) : null,
            isPaper: true,
            reasoning: decision.reasoning,
            status: 'filled',
          });

          newTrades++;
        }

        // Update session balance — cap to prevent DB numeric overflow
        const rawBalance = currentBalance + balanceDelta;
        const updatedBalance = Math.max(0, Math.min(rawBalance, 99_999_999));
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
  setTimeout(processShadowTrades, 5_000);
  // Then every 30 seconds
  setInterval(processShadowTrades, 30_000);
  console.log('[ShadowTrade] Job started - runs every 30 seconds (AI-powered hybrid engine)');
}
