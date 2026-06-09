import { eq, sql, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { shadowSessions, bots, botSubscriptions } from '../db/schema/bots.js';
import { trades } from '../db/schema/trades.js';
import { activityLog } from '../db/schema/training.js';
import { botDecisions } from '../db/schema/decisions.js';
import { getPrice, isUSMarketOpen } from './price-sync.job.js';
import { processSymbol } from '../lib/bot-engine.js';
import { sendNotification } from '../lib/notify.js';

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

interface ShadowCompounding {
  enabled?: boolean;
  reinvestmentRate?: number;
  reinvestmentMode?: 'free_balance' | 'total_balance' | 'fixed';
  compoundFrequency?: 'each_trade' | 'daily' | 'weekly' | 'manual';
  minProfitThresholdUSD?: number;
  maxCompoundMultiplier?: number;
  withdrawalReservePct?: number;
  totalCompounded?: number;
  lastCompoundAt?: string | null;
}

interface UserConfig {
  riskMultiplier?: number;
  maxDailyLoss?: number;
  autoStopBalance?: number;
  autoStopDays?: number;
  autoStopLossPercent?: number;
  compoundProfits?: boolean;
  notificationLevel?: string;
  compounding?: ShadowCompounding;
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

        // Build effective userConfig: session-level settings override subscription defaults.
        // Shadow users who never subscribed (no sub row) still get their shadow settings.
        const [subRow] = await db
          .select({ userConfig: botSubscriptions.userConfig })
          .from(botSubscriptions)
          .where(and(
            eq(botSubscriptions.userId, session.userId),
            eq(botSubscriptions.botId, session.botId!),
          ))
          .limit(1);
        const subConfig = (subRow?.userConfig ?? {}) as UserConfig;
        const sessionConfig = (session.userConfig as UserConfig | null) ?? {};
        // Session-level keys win — shadow settings modal writes here
        const userConfig: UserConfig = { ...subConfig, ...sessionConfig };


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
            feeRate,
          });

          if (decision.action === 'HOLD') continue;

          // Use exact amount/value from the engine (set on decision by processSymbol).
          // This guarantees trades table matches bot_positions exactly — no independent recalc.
          const tradeAmount = decision.tradeAmount;
          const tradeValue = decision.tradeValue;

          // Skip if engine didn't produce a valid trade (e.g. price data missing)
          if (!tradeAmount || !tradeValue || tradeAmount <= 0 || tradeValue <= 0) continue;

          const fee = tradeValue * feeRate;
          let pnl: number | null = null;
          let pnlPercent: number | null = null;
          let isWin = false;

          if (decision.action === 'SELL') {
            // decision.pnl is from closePosition() — already fee-inclusive via feeRate param
            pnl = decision.pnl ?? null;
            pnlPercent = decision.pnlPercent ?? null;
            if (pnl !== null) {
              balanceDelta += pnl;
              if (pnl > 0) { newWins++; isWin = true; }
            }
          } else {
            // BUY: no realised PnL, deduct fee from virtual balance only
            balanceDelta -= fee;
            pnl = null;
            pnlPercent = null;
          }

          await db.insert(trades).values({
            userId: session.userId,
            shadowSessionId: session.id,
            symbol: pair,
            side: decision.action,
            amount: tradeAmount.toFixed(8),
            price: priceData.price.toFixed(8),
            totalValue: tradeValue.toFixed(2),
            pnl: pnl !== null ? pnl.toFixed(2) : null,
            pnlPercent: pnlPercent !== null ? pnlPercent.toFixed(4) : null,
            isPaper: true,
            reasoning: decision.reasoning,
            status: 'filled',
          });

          newTrades++;

          // Virtual compounding — increase currentBalance after profitable SELL if enabled
          if (decision.action === 'SELL' && pnl !== null && pnl > 0) {
            const cs = userConfig.compounding;
            if (cs?.enabled) {
              const threshold = cs.minProfitThresholdUSD ?? 0;
              if (pnl >= threshold) {
                // Frequency gate
                let freqOk = true;
                if (cs.compoundFrequency === 'daily' && cs.lastCompoundAt) {
                  const hoursSince = (Date.now() - new Date(cs.lastCompoundAt).getTime()) / 3_600_000;
                  freqOk = hoursSince >= 24;
                } else if (cs.compoundFrequency === 'weekly' && cs.lastCompoundAt) {
                  const hoursSince = (Date.now() - new Date(cs.lastCompoundAt).getTime()) / 3_600_000;
                  freqOk = hoursSince >= 168;
                }

                if (freqOk) {
                  const rate = (cs.reinvestmentRate ?? 50) / 100;
                  const reservePct = (cs.withdrawalReservePct ?? 0) / 100;
                  // toReinvest is the portion of this trade's profit that gets
                  // locked in as compounded capital. The full pnl is already in
                  // balanceDelta — we only track how much was deliberately retained
                  // (vs mentally "withdrawn") for the totalCompounded stat.
                  let toReinvest = pnl * rate * (1 - reservePct);

                  // Cap at maxCompoundMultiplier headroom
                  const maxMult = cs.maxCompoundMultiplier ?? 3;
                  const startBal = parseFloat(session.virtualBalance);
                  const totalCompounded = cs.totalCompounded ?? 0;
                  const currentAlloc = startBal + totalCompounded;
                  const headroom = (startBal * maxMult) - currentAlloc;
                  if (headroom > 0) {
                    toReinvest = Math.min(toReinvest, headroom);
                    // Do NOT add toReinvest to balanceDelta — pnl is already
                    // included. We only update the tracking counter so the UI
                    // can display total compounded and enforce the multiplier cap.
                    const newTotalCompounded = totalCompounded + toReinvest;

                    // Persist updated compounding stats back to session userConfig
                    const updatedConfig: UserConfig = {
                      ...userConfig,
                      compounding: {
                        ...cs,
                        totalCompounded: Math.round(newTotalCompounded * 100) / 100,
                        lastCompoundAt: new Date().toISOString(),
                      },
                    };
                    await db.update(shadowSessions)
                      .set({ userConfig: updatedConfig as any })
                      .where(eq(shadowSessions.id, session.id));
                    // Update local reference so subsequent pairs in this loop see updated state
                    (userConfig as UserConfig).compounding = updatedConfig.compounding;
                    console.log(`[ShadowTrade] Compounded +$${toReinvest.toFixed(2)} for session ${session.id}`);
                  }
                }
              }
            }
          }

          // Shadow trade notification — respect user's notificationLevel setting
          const notifLevel = userConfig.notificationLevel ?? 'all';
          const isSell = decision.action === 'SELL';
          const shouldNotify =
            notifLevel === 'all' ||
            (notifLevel === 'wins_only' && isSell && isWin) ||
            (notifLevel === 'losses_only' && isSell && !isWin && pnl !== null) ||
            notifLevel === 'summary'; // summary: suppressed here, sent as daily digest elsewhere

          if (shouldNotify && notifLevel !== 'summary') {
            const priceDisplay = priceData.price >= 1000
              ? `$${priceData.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
              : `$${priceData.price.toFixed(2)}`;
            const pnlStr = pnl !== null ? ` (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})` : '';
            await sendNotification(session.userId, {
              type: 'trade',
              title: `Shadow ${decision.action} ${pair} @ ${priceDisplay}${pnlStr}`,
              body: `${bot.name}: ${decision.reasoning}`,
            }).catch(() => {});
          }
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

          // Push real-time shadow equity update via WebSocket (separate from live equity)
          try {
            const { publishMessage } = await import('../config/redis.js');
            const closedPos = await db
              .select({ pnl: trades.pnl })
              .from(trades)
              .where(and(
                eq(trades.shadowSessionId, session.id),
                eq(trades.userId, session.userId),
                eq(trades.isPaper, true),
                eq(trades.side, 'SELL'),
              ));

            let cumPnl = 0;
            for (const p of closedPos) {
              cumPnl += parseFloat(p.pnl ?? '0');
            }

            await publishMessage(`shadow:equity:${session.userId}`, {
              sessionId: session.id,
              botId: bot.id,
              userId: session.userId,
              newPoint: Math.round(cumPnl * 100) / 100,
              totalPnl: Math.round(cumPnl * 100) / 100,
              currentBalance: updatedBalance,
            });
          } catch (wsErr: any) {
            console.warn(`[ShadowTrade] WS push failed for session ${session.id}:`, wsErr.message);
          }
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
