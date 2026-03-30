/**
 * Arena Tick Job — Real Bot Engine Battle System
 * Uses the same processSymbol() engine as shadow/live trading.
 * State persisted to Redis for restart survival.
 * Publishes updates via WebSocket.
 */

import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { redisConnection } from '../config/queue.js';
import { arenaSessions, arenaGladiators } from '../db/schema/arena';
import { bots } from '../db/schema/bots';
import { getPrice } from './price-sync.job.js';
import { processSymbol } from '../lib/bot-engine.js';
import { sendNotification } from '../lib/notify.js';

interface GladiatorState {
  balance: number;
  equityCurve: number[];
  trades: number;
  wins: number;
  decisions: { action: string; symbol: string; price: number; reasoning: string; time: string }[];
}

const ARENA_TICK_INTERVAL = 10_000; // 10 seconds
const MAX_EQUITY_POINTS = 300;
const MAX_HOLD_LOG = 20; // Only keep last 20 HOLDs (trim old ones)
const MAX_TRADE_LOG = 500; // Keep ALL BUY/SELL decisions (never trim)

// ─── Redis State Persistence ────────────────────────────────────────────────

async function getState(gladiatorId: string, initialBalance: number): Promise<GladiatorState> {
  try {
    const raw = await redisConnection.get(`arena:state:${gladiatorId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { balance: initialBalance, equityCurve: [initialBalance], trades: 0, wins: 0, decisions: [] };
}

async function saveState(gladiatorId: string, state: GladiatorState) {
  try {
    await redisConnection.set(`arena:state:${gladiatorId}`, JSON.stringify(state), 'EX', 86400);
  } catch {}
}

async function clearState(gladiatorId: string) {
  try { await redisConnection.del(`arena:state:${gladiatorId}`); } catch {}
}

// ─── Main Tick ──────────────────────────────────────────────────────────────

async function processArenaTick() {
  try {
    const runningSessions = await db.select().from(arenaSessions).where(eq(arenaSessions.status, 'running'));
    if (runningSessions.length === 0) return;

    for (const session of runningSessions) {
      try {
        const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
        const elapsed = (Date.now() - startedAt) / 1000;
        const duration = session.durationSeconds ?? 180;

        if (elapsed >= duration) {
          await finalizeArenaSession(session.id, session.userId);
          continue;
        }

        const initialBalance = parseFloat(session.virtualBalance ?? '10000');

        const gladiators = await db
          .select({
            gladiator: arenaGladiators,
            botStrategy: bots.strategy,
            botPrompt: bots.prompt,
            botRiskLevel: bots.riskLevel,
            botConfig: bots.config,
          })
          .from(arenaGladiators)
          .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
          .where(eq(arenaGladiators.sessionId, session.id));

        for (const { gladiator, botStrategy, botPrompt, botRiskLevel, botConfig } of gladiators) {
          const state = await getState(gladiator.id, initialBalance);
          const config = (botConfig ?? {}) as any;
          const pairs = config.pairs?.length ? config.pairs : ['BTC/USDT', 'ETH/USDT'];

          for (const symbol of pairs) {
            // Use the REAL bot engine for decisions
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
              maxPositionPct: config.maxPositionSize ? config.maxPositionSize / 100 : 20,
              tradeDirection: config.tradeDirection ?? 'both',
              mode: 'paper', // Arena always paper
            });

            // Track decisions — keep ALL trades, trim old HOLDs
            const decPrice = decision.price > 0 ? decision.price : (await getPrice(symbol))?.price ?? 0;
            if (decision.action !== 'HOLD') {
              state.trades++;
              if (decision.pnl && decision.pnl > 0) state.wins++;

              // Send push notification for arena trades
              await sendNotification(session.userId, {
                type: 'trade',
                title: `Arena: ${decision.action} ${symbol}`,
                body: `${(await db.select({ name: bots.name }).from(bots).where(eq(bots.id, gladiator.botId)).limit(1))[0]?.name ?? 'Bot'}: ${decision.reasoning.slice(0, 80)}`,
              }).catch(() => {});
            }

            if (decPrice > 0) {
              state.decisions.push({
                action: decision.action,
                symbol,
                price: decPrice,
                reasoning: decision.reasoning.slice(0, 120),
                time: new Date().toISOString(),
              });

              // Trim: keep ALL BUY/SELL but only last N HOLDs
              const trades = state.decisions.filter(d => d.action !== 'HOLD');
              const holds = state.decisions.filter(d => d.action === 'HOLD');
              if (holds.length > MAX_HOLD_LOG) {
                state.decisions = [...trades, ...holds.slice(-MAX_HOLD_LOG)]
                  .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
              }
            }
          }

          // Calculate total equity (balance + open positions value)
          let equity = state.balance;
          // The bot engine tracks positions in DB, so query current open positions
          try {
            const { botPositions } = await import('../db/schema/positions');
            const openPositions = await db.select().from(botPositions)
              .where(eq(botPositions.botId, gladiator.botId));
            for (const pos of openPositions.filter(p => p.status === 'open')) {
              const priceData = await getPrice(pos.symbol);
              if (priceData) equity += parseFloat(pos.amount) * priceData.price;
            }
          } catch {}

          state.balance = equity;
          state.equityCurve.push(equity);
          if (state.equityCurve.length > MAX_EQUITY_POINTS) {
            // Keep first, last, and every Nth point
            const keep = Math.ceil(MAX_EQUITY_POINTS * 0.7);
            const step = Math.floor(state.equityCurve.length / keep);
            state.equityCurve = state.equityCurve.filter((_, i) =>
              i === 0 || i === state.equityCurve.length - 1 || i % step === 0
            );
          }

          await saveState(gladiator.id, state);

          // Update DB with latest equity data (every tick for live chart)
          const returnPct = Math.max(-9999, Math.min(9999, ((equity - initialBalance) / initialBalance) * 100));
          const pnl = Math.max(-9999999999, Math.min(9999999999, equity - initialBalance));
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

        // Publish live update via Redis for WebSocket
        try {
          const payload = { type: 'arena_tick', sessionId: session.id, timestamp: new Date().toISOString() };
          await redisConnection.publish(`arena:${session.id}`, JSON.stringify(payload));
        } catch {}

      } catch (err: any) {
        console.error(`[ArenaTick] Error processing session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[ArenaTick] Error:', err.message);
  }
}

// ─── Finalize ───────────────────────────────────────────────────────────────

async function finalizeArenaSession(sessionId: string, userId: string) {
  console.log(`[ArenaTick] Finalizing arena session ${sessionId}`);

  try {
    const initialBalance = 10_000;
    const gladiators = await db.select().from(arenaGladiators).where(eq(arenaGladiators.sessionId, sessionId));
    const results: { gladiatorId: string; finalReturn: number; winRate: number; equity: number[]; trades: number; pnl: number }[] = [];

    for (const gladiator of gladiators) {
      const state = await getState(gladiator.id, initialBalance);
      state.equityCurve.push(state.balance);

      const finalReturn = ((state.balance - initialBalance) / initialBalance) * 100;
      const winRate = state.trades > 0 ? (state.wins / state.trades) * 100 : 0;

      results.push({
        gladiatorId: gladiator.id,
        finalReturn,
        winRate,
        equity: state.equityCurve,
        trades: state.trades,
        pnl: state.balance - initialBalance,
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

    // Get winner bot name
    const [winner] = await db.select({ name: bots.name }).from(arenaGladiators)
      .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
      .where(eq(arenaGladiators.id, results[0]?.gladiatorId ?? ''));

    await sendNotification(userId, {
      type: 'system',
      title: 'Arena Battle Complete!',
      body: `${winner?.name ?? 'Bot'} won with ${results[0]?.finalReturn.toFixed(2)}% return! ${results.length} bots competed.`,
      priority: 'high',
    }).catch(() => {});

    // Publish completion via WebSocket
    try {
      await redisConnection.publish(`arena:${sessionId}`, JSON.stringify({ type: 'arena_complete', sessionId }));
    } catch {}

    console.log(`[ArenaTick] Session ${sessionId} completed. Winner: ${winner?.name} with ${results[0]?.finalReturn.toFixed(2)}%`);
  } catch (err: any) {
    console.error(`[ArenaTick] Error finalizing session ${sessionId}:`, err.message);
  }
}

export async function startArenaTickJob() {
  setInterval(processArenaTick, ARENA_TICK_INTERVAL);
  console.log(`[ArenaTick] Job started - runs every ${ARENA_TICK_INTERVAL / 1000}s (real bot engine)`);
}
