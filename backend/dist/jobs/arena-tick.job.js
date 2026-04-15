/**
 * Arena Tick Job — Shared Balance Pool Battle System
 *
 * Each bot runs with its own slice of the shared pool.
 * Crypto bots split the crypto pool; stock bots split the stock pool.
 * Stock bots skip ticks when US market is closed.
 * State persisted to Redis for restart survival.
 */
import { eq, and, isNotNull, sql as drizzleSql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { redisConnection } from '../config/queue.js';
import { arenaSessions, arenaGladiators } from '../db/schema/arena.js';
import { bots } from '../db/schema/bots.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { getPrice } from './price-sync.job.js';
import { processSymbol, executeLiveTrade } from '../lib/bot-engine.js';
import { sendNotification } from '../lib/notify.js';
import { isUSMarketOpen } from '../modules/arena/arena.service.js';
const ARENA_TICK_INTERVAL = 10_000; // 10 seconds
const MAX_EQUITY_POINTS = 300;
const MAX_HOLD_LOG = 50;
// ─── Helpers ────────────────────────────────────────────────────────────────
/** Detect if pairs list belongs to stocks or crypto, with category fallback */
function getBotAssetClass(config, category) {
    const pairs = config?.pairs ?? [];
    if (pairs.length > 0) {
        const stockPairs = pairs.filter((p) => !p.includes('/'));
        const cryptoPairs = pairs.filter((p) => p.includes('/'));
        if (stockPairs.length > 0 && cryptoPairs.length > 0)
            return 'mixed';
        if (stockPairs.length > 0)
            return 'stocks';
        return 'crypto';
    }
    const cat = (category ?? '').toLowerCase();
    if (cat === 'stocks' || cat === 'equity' || cat === 'etf')
        return 'stocks';
    return 'crypto';
}
// ─── Redis State Persistence ────────────────────────────────────────────────
async function getState(gladiatorId, startingAlloc) {
    try {
        const raw = await redisConnection.get(`arena:state:${gladiatorId}`);
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    return {
        balance: startingAlloc,
        startingAlloc,
        equityCurve: [startingAlloc],
        trades: 0,
        wins: 0,
        totalDecisions: 0,
        decisions: [],
    };
}
async function saveState(gladiatorId, state) {
    try {
        await redisConnection.set(`arena:state:${gladiatorId}`, JSON.stringify(state), 'EX', 86400);
    }
    catch { }
}
async function clearState(gladiatorId) {
    try {
        await redisConnection.del(`arena:state:${gladiatorId}`);
    }
    catch { }
}
// ─── Main Tick ──────────────────────────────────────────────────────────────
async function processArenaTick() {
    try {
        const runningSessions = await db.select().from(arenaSessions)
            .where(and(eq(arenaSessions.status, 'running'), isNotNull(arenaSessions.startedAt)));
        if (runningSessions.length === 0)
            return;
        const marketOpen = isUSMarketOpen();
        for (const session of runningSessions) {
            try {
                const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
                const elapsed = (Date.now() - startedAt) / 1000;
                const duration = session.durationSeconds ?? 180;
                if (elapsed >= duration) {
                    await finalizeArenaSession(session.id, session.userId);
                    continue;
                }
                const gladiators = await db
                    .select({
                    gladiator: arenaGladiators,
                    botStrategy: bots.strategy,
                    botPrompt: bots.prompt,
                    botRiskLevel: bots.riskLevel,
                    botConfig: bots.config,
                    botCategory: bots.category,
                    botName: bots.name,
                })
                    .from(arenaGladiators)
                    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
                    .where(eq(arenaGladiators.sessionId, session.id));
                for (const { gladiator, botStrategy, botPrompt, botRiskLevel, botConfig, botCategory, botName } of gladiators) {
                    const config = (botConfig ?? {});
                    const assetClass = getBotAssetClass(config, botCategory);
                    const isStockBot = assetClass === 'stocks';
                    const isLiveMode = session.mode === 'live';
                    // ── For live mode: resolve the correct exchange connection ──
                    let liveExchangeConnId;
                    if (isLiveMode) {
                        const [conn] = await db.select({ id: exchangeConnections.id })
                            .from(exchangeConnections)
                            .where(and(eq(exchangeConnections.userId, session.userId), eq(exchangeConnections.status, 'connected'), isStockBot
                            ? drizzleSql `LOWER(${exchangeConnections.provider}) = 'alpaca'`
                            : eq(exchangeConnections.assetClass, 'crypto')))
                            .limit(1);
                        if (!conn) {
                            // No exchange available — skip this bot this tick
                            continue;
                        }
                        liveExchangeConnId = conn.id;
                    }
                    // ── Market hours gate for stock bots ──
                    if (isStockBot && !marketOpen) {
                        // Stock bot idles when US market is closed — just log a HOLD tick
                        const equityArr = Array.isArray(gladiator.equityData) ? gladiator.equityData : [];
                        const state = await getState(gladiator.id, equityArr[0] ?? parseFloat(session.perBotAllocation ?? '10000'));
                        // Push same equity point (no change) so chart continues flat
                        state.equityCurve.push(state.balance);
                        if (state.equityCurve.length > MAX_EQUITY_POINTS) {
                            const keep = Math.ceil(MAX_EQUITY_POINTS * 0.7);
                            const step = Math.floor(state.equityCurve.length / keep);
                            state.equityCurve = state.equityCurve.filter((_, i) => i === 0 || i === state.equityCurve.length - 1 || i % step === 0);
                        }
                        await saveState(gladiator.id, state);
                        await db.update(arenaGladiators).set({
                            equityData: state.equityCurve,
                        }).where(eq(arenaGladiators.id, gladiator.id));
                        continue; // skip processing this bot this tick
                    }
                    // ── Determine starting allocation for this bot ──
                    // First equity point = starting alloc set at session creation
                    const equityArr = Array.isArray(gladiator.equityData) ? gladiator.equityData : [];
                    const startingAlloc = equityArr[0] ?? parseFloat(session.perBotAllocation ?? '10000');
                    const state = await getState(gladiator.id, startingAlloc);
                    const pairs = config.pairs?.length ? config.pairs : (isStockBot ? ['AAPL', 'NVDA'] : ['BTC/USDT', 'ETH/USDT']);
                    for (const symbol of pairs) {
                        // Skip stock symbols when market is closed (mixed bot)
                        const isStockSymbol = !symbol.includes('/');
                        if (isStockSymbol && !marketOpen)
                            continue;
                        const decision = await processSymbol({
                            sessionKey: `arena:${gladiator.id}`,
                            symbol,
                            botId: gladiator.botId,
                            userId: session.userId,
                            botPrompt: botPrompt ?? '',
                            strategy: botStrategy,
                            riskLevel: botRiskLevel ?? 'Med',
                            balance: state.balance,
                            stopLoss: config.stopLoss,
                            takeProfit: config.takeProfit,
                            maxPositionPct: config.maxPositionSize ?? 20,
                            tradeDirection: config.tradeDirection ?? 'both',
                            mode: isLiveMode ? 'live' : 'shadow',
                            exchangeConnId: liveExchangeConnId,
                            // Link positions to this arena session for scoped equity tracking
                            shadowSessionId: gladiator.id,
                            aiMode: config.aiMode,
                            aiConfidenceThreshold: config.aiConfidenceThreshold,
                            // Arena: force aggressive frequency so bots trade within short battle windows.
                            // Battles often run 3–10 min; balanced (10min cooldown) would allow 0–1 trades.
                            tradingFrequency: 'aggressive',
                            maxHoldsBeforeAI: config.maxHoldsBeforeAI ?? 2,
                            maxOpenPositions: config.maxOpenPositions,
                            customEntryConditions: config.customEntryConditions,
                            customExitConditions: config.customExitConditions,
                        });
                        const decPrice = decision.price > 0 ? decision.price : (await getPrice(symbol))?.price ?? 0;
                        if (decision.action !== 'HOLD') {
                            state.trades++;
                            if (decision.pnl && decision.pnl > 0)
                                state.wins++;
                            // ── Live mode: execute real order on exchange ──
                            if (isLiveMode && liveExchangeConnId && decision.confidence >= (config.aiConfidenceThreshold ?? 60)) {
                                const result = await executeLiveTrade(decision, session.userId, gladiator.botId, gladiator.id, // use gladiator id as subscriptionId for arena trades
                                liveExchangeConnId, config.orderType ?? 'market').catch((e) => ({ success: false, error: e.message }));
                                if (result.success) {
                                    console.log(`[ArenaTick] Live order filled: ${'orderId' in result ? result.orderId : ''} (${botName} ${decision.action} ${symbol})`);
                                }
                                else {
                                    console.warn(`[ArenaTick] Live order failed for ${botName}: ${'error' in result ? result.error : 'unknown'}`);
                                }
                            }
                            await sendNotification(session.userId, {
                                type: 'trade',
                                title: `Arena${isLiveMode ? ' LIVE' : ''}: ${decision.action} ${symbol}`,
                                body: `${botName}: ${decision.reasoning.slice(0, 80)}`,
                            }).catch(() => { });
                        }
                        // Always log decision regardless of whether we have a live price.
                        // decPrice may be 0 if price sync hasn't run yet — still valuable to log.
                        state.totalDecisions = (state.totalDecisions ?? 0) + 1;
                        state.decisions.push({
                            action: decision.action,
                            symbol,
                            price: decPrice,
                            reasoning: decision.reasoning.slice(0, 150),
                            time: new Date().toISOString(),
                        });
                        const trades = state.decisions.filter(d => d.action !== 'HOLD');
                        const holds = state.decisions.filter(d => d.action === 'HOLD');
                        if (holds.length > MAX_HOLD_LOG) {
                            state.decisions = [...trades, ...holds.slice(-MAX_HOLD_LOG)]
                                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                        }
                    }
                    // ── Equity: initialAlloc + realized + unrealized (scoped to THIS session) ──
                    let realizedPnl = 0;
                    let unrealizedPnl = 0;
                    try {
                        const { botPositions } = await import('../db/schema/positions.js');
                        const { and: andOp } = await import('drizzle-orm');
                        // Query positions scoped exactly to this gladiator via shadowSessionId tag.
                        // For live mode query real (non-paper) positions; for shadow query paper positions.
                        const arenaPositions = await db.select().from(botPositions)
                            .where(andOp(eq(botPositions.botId, gladiator.botId), eq(botPositions.userId, session.userId), eq(botPositions.isPaper, !isLiveMode), eq(botPositions.shadowSessionId, gladiator.id)));
                        for (const pos of arenaPositions) {
                            if (pos.status === 'closed') {
                                realizedPnl += parseFloat(pos.pnl ?? '0');
                            }
                            else if (pos.status === 'open') {
                                const priceData = await getPrice(pos.symbol);
                                if (priceData) {
                                    const entryPrice = parseFloat(pos.entryPrice);
                                    const amount = parseFloat(pos.amount);
                                    unrealizedPnl += (priceData.price - entryPrice) * amount;
                                }
                            }
                        }
                        const closedPositions = arenaPositions.filter(p => p.status === 'closed');
                        state.trades = closedPositions.length;
                        state.wins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
                    }
                    catch (err) {
                        console.warn('[ArenaTick] Position query error:', err.message);
                    }
                    // Equity relative to THIS bot's starting allocation
                    const equity = startingAlloc + realizedPnl + unrealizedPnl;
                    state.balance = equity;
                    state.equityCurve.push(equity);
                    if (state.equityCurve.length > MAX_EQUITY_POINTS) {
                        const keep = Math.ceil(MAX_EQUITY_POINTS * 0.7);
                        const step = Math.floor(state.equityCurve.length / keep);
                        state.equityCurve = state.equityCurve.filter((_, i) => i === 0 || i === state.equityCurve.length - 1 || i % step === 0);
                    }
                    await saveState(gladiator.id, state);
                    // Return % relative to THIS bot's allocation (not total pool)
                    const returnPct = startingAlloc > 0
                        ? Math.max(-9999, Math.min(9999, ((equity - startingAlloc) / startingAlloc) * 100))
                        : 0;
                    const pnl = Math.max(-9999999999, Math.min(9999999999, equity - startingAlloc));
                    const wr = state.trades > 0 ? Math.min(100, (state.wins / state.trades) * 100) : 0;
                    await db.update(arenaGladiators).set({
                        equityData: state.equityCurve,
                        finalReturn: returnPct.toFixed(4),
                        winRate: wr.toFixed(2),
                        totalTrades: state.trades,
                        totalPnl: pnl.toFixed(2),
                        decisionLog: state.decisions,
                    }).where(eq(arenaGladiators.id, gladiator.id));
                }
                // Publish live update via Redis → WebSocket
                try {
                    await redisConnection.publish(`arena:${session.id}`, JSON.stringify({
                        type: 'arena_tick',
                        sessionId: session.id,
                        timestamp: new Date().toISOString(),
                        marketOpen,
                    }));
                }
                catch { }
            }
            catch (err) {
                console.error(`[ArenaTick] Error processing session ${session.id}:`, err.message);
            }
        }
    }
    catch (err) {
        console.error('[ArenaTick] Error:', err.message);
    }
}
// ─── Finalize ───────────────────────────────────────────────────────────────
async function finalizeArenaSession(sessionId, userId) {
    console.log(`[ArenaTick] Finalizing arena session ${sessionId}`);
    try {
        const [session] = await db.select().from(arenaSessions).where(eq(arenaSessions.id, sessionId)).limit(1);
        if (!session)
            return;
        const gladiators = await db.select().from(arenaGladiators).where(eq(arenaGladiators.sessionId, sessionId));
        const results = [];
        for (const gladiator of gladiators) {
            const equityArr = Array.isArray(gladiator.equityData) ? gladiator.equityData : [];
            const startingAlloc = equityArr[0] ?? parseFloat(session.perBotAllocation ?? '10000');
            const state = await getState(gladiator.id, startingAlloc);
            state.equityCurve.push(state.balance);
            const finalReturn = startingAlloc > 0 ? ((state.balance - startingAlloc) / startingAlloc) * 100 : 0;
            const winRate = state.trades > 0 ? (state.wins / state.trades) * 100 : 0;
            results.push({
                gladiatorId: gladiator.id,
                finalReturn,
                winRate,
                equity: state.equityCurve,
                trades: state.trades,
                pnl: state.balance - startingAlloc,
                startingAlloc,
            });
            await clearState(gladiator.id);
        }
        results.sort((a, b) => b.finalReturn - a.finalReturn);
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            await db.update(arenaGladiators).set({
                rank: i + 1,
                finalReturn: r.finalReturn.toFixed(4),
                winRate: r.winRate.toFixed(2),
                equityData: r.equity,
                totalTrades: r.trades,
                totalPnl: r.pnl.toFixed(2),
                isWinner: i === 0,
            }).where(eq(arenaGladiators.id, r.gladiatorId));
        }
        await db.update(arenaSessions).set({ status: 'completed', endedAt: new Date() }).where(eq(arenaSessions.id, sessionId));
        const [winner] = await db.select({ name: bots.name }).from(arenaGladiators)
            .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
            .where(eq(arenaGladiators.id, results[0]?.gladiatorId ?? ''));
        await sendNotification(userId, {
            type: 'system',
            title: 'Arena Battle Complete!',
            body: `${winner?.name ?? 'Bot'} won with ${results[0]?.finalReturn.toFixed(2)}% return! ${results.length} bots competed.`,
            priority: 'high',
        }).catch(() => { });
        try {
            await redisConnection.publish(`arena:${sessionId}`, JSON.stringify({ type: 'arena_complete', sessionId }));
        }
        catch { }
        console.log(`[ArenaTick] Session ${sessionId} completed. Winner: ${winner?.name} with ${results[0]?.finalReturn.toFixed(2)}%`);
    }
    catch (err) {
        console.error(`[ArenaTick] Error finalizing session ${sessionId}:`, err.message);
    }
}
export async function startArenaTickJob() {
    setInterval(processArenaTick, ARENA_TICK_INTERVAL);
    console.log(`[ArenaTick] Job started — every ${ARENA_TICK_INTERVAL / 1000}s | market hours respected for stock bots`);
}
