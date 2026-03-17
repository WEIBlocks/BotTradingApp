import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { arenaSessions, arenaGladiators } from '../db/schema/arena';
import { bots } from '../db/schema/bots';
import { getPrice } from './price-sync.job.js';

// In-memory state for arena gladiators
interface GladiatorState {
  balance: number;
  equityCurve: number[];
  trades: number;
  wins: number;
  positions: Map<string, { entryPrice: number; amount: number }>;
  lastPrices: Map<string, number[]>;
}

const gladiatorStates: Map<string, GladiatorState> = new Map();

function getOrCreateState(gladiatorId: string): GladiatorState {
  if (!gladiatorStates.has(gladiatorId)) {
    gladiatorStates.set(gladiatorId, {
      balance: 10_000,
      equityCurve: [10_000],
      trades: 0,
      wins: 0,
      positions: new Map(),
      lastPrices: new Map(),
    });
  }
  return gladiatorStates.get(gladiatorId)!;
}

const ARENA_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

function simulateArenaDecision(
  strategy: string,
  state: GladiatorState,
  symbol: string,
  currentPrice: number,
): { action: 'buy' | 'sell' | 'hold'; amount: number; reason: string } {
  if (!state.lastPrices.has(symbol)) {
    state.lastPrices.set(symbol, []);
  }
  const prices = state.lastPrices.get(symbol)!;
  prices.push(currentPrice);
  if (prices.length > 30) prices.shift();

  const existingPos = state.positions.get(symbol);
  const strat = strategy.toLowerCase();
  const noise = (Math.random() - 0.5) * 0.02;

  if (strat.includes('momentum') || strat.includes('trend')) {
    if (prices.length >= 5) {
      const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const momentum = (currentPrice - ma5) / ma5;
      if (momentum + noise > 0.001 && !existingPos) {
        const amount = (state.balance * 0.3) / currentPrice;
        return { action: 'buy', amount, reason: `Momentum entry: ${(momentum * 100).toFixed(2)}%` };
      }
      if (momentum + noise < -0.001 && existingPos) {
        return { action: 'sell', amount: existingPos.amount, reason: `Momentum exit: ${(momentum * 100).toFixed(2)}%` };
      }
    }
  } else if (strat.includes('scalp')) {
    if (existingPos) {
      const pnlPct = ((currentPrice - existingPos.entryPrice) / existingPos.entryPrice);
      if (pnlPct > 0.003 + noise) {
        return { action: 'sell', amount: existingPos.amount, reason: `Scalp TP: ${(pnlPct * 100).toFixed(2)}%` };
      }
      if (pnlPct < -0.004) {
        return { action: 'sell', amount: existingPos.amount, reason: `Scalp SL: ${(pnlPct * 100).toFixed(2)}%` };
      }
    } else if (Math.random() < 0.25) {
      const amount = (state.balance * 0.25) / currentPrice;
      return { action: 'buy', amount, reason: 'Scalp entry' };
    }
  } else if (strat.includes('grid')) {
    if (prices.length >= 2) {
      const prevPrice = prices[prices.length - 2];
      const gridSize = prevPrice * 0.005;
      if (currentPrice <= prevPrice - gridSize && !existingPos) {
        const amount = (state.balance * 0.2) / currentPrice;
        return { action: 'buy', amount, reason: `Grid buy at ${currentPrice.toFixed(2)}` };
      }
      if (currentPrice >= prevPrice + gridSize && existingPos) {
        return { action: 'sell', amount: existingPos.amount, reason: `Grid sell at ${currentPrice.toFixed(2)}` };
      }
    }
  } else if (strat.includes('dca') || strat.includes('dollar')) {
    if (Math.random() < 0.15 && !existingPos) {
      const amount = (state.balance * 0.1) / currentPrice;
      return { action: 'buy', amount, reason: 'DCA buy' };
    }
    if (existingPos) {
      const pnlPct = ((currentPrice - existingPos.entryPrice) / existingPos.entryPrice);
      if (pnlPct > 0.01) {
        return { action: 'sell', amount: existingPos.amount, reason: `DCA take profit: ${(pnlPct * 100).toFixed(2)}%` };
      }
    }
  } else {
    if (prices.length >= 10) {
      const avg = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const deviation = (currentPrice - avg) / avg;
      if (deviation + noise < -0.005 && !existingPos) {
        const amount = (state.balance * 0.25) / currentPrice;
        return { action: 'buy', amount, reason: `Mean reversion buy: ${(deviation * 100).toFixed(2)}% below avg` };
      }
      if (deviation + noise > 0.005 && existingPos) {
        return { action: 'sell', amount: existingPos.amount, reason: `Mean reversion sell: ${(deviation * 100).toFixed(2)}% above avg` };
      }
    }
  }

  return { action: 'hold', amount: 0, reason: '' };
}

async function processArenaTick() {
  try {
    const runningSessions = await db
      .select()
      .from(arenaSessions)
      .where(eq(arenaSessions.status, 'running'));

    if (runningSessions.length === 0) return;

    console.log(`[ArenaTick] Processing ${runningSessions.length} active arena sessions`);

    for (const session of runningSessions) {
      try {
        const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
        const elapsed = (Date.now() - startedAt) / 1000;
        const duration = session.durationSeconds ?? 180;

        if (elapsed >= duration) {
          await finalizeArenaSession(session.id);
          continue;
        }

        const gladiators = await db
          .select({ gladiator: arenaGladiators, botStrategy: bots.strategy, botConfig: bots.config })
          .from(arenaGladiators)
          .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
          .where(eq(arenaGladiators.sessionId, session.id));

        for (const { gladiator, botStrategy } of gladiators) {
          const state = getOrCreateState(gladiator.id);

          for (const symbol of ARENA_PAIRS) {
            const priceData = await getPrice(symbol);
            if (!priceData) continue;

            const decision = simulateArenaDecision(botStrategy, state, symbol, priceData.price);

            if (decision.action === 'buy' && decision.amount > 0) {
              const cost = decision.amount * priceData.price;
              if (cost <= state.balance) {
                state.balance -= cost;
                state.positions.set(symbol, { entryPrice: priceData.price, amount: decision.amount });
                state.trades++;
              }
            } else if (decision.action === 'sell' && decision.amount > 0) {
              const revenue = decision.amount * priceData.price;
              state.balance += revenue;
              const pos = state.positions.get(symbol);
              if (pos) {
                const pnl = revenue - (pos.amount * pos.entryPrice);
                if (pnl > 0) state.wins++;
              }
              state.positions.delete(symbol);
              state.trades++;
            }
          }

          let equity = state.balance;
          for (const [symbol, pos] of state.positions) {
            const priceData = await getPrice(symbol);
            if (priceData) equity += pos.amount * priceData.price;
          }

          state.equityCurve.push(equity);
          if (state.equityCurve.length > 500) {
            state.equityCurve = state.equityCurve.filter((_, i) =>
              i === 0 || i === state.equityCurve.length - 1 || i % 2 === 0
            );
          }
        }
      } catch (err: any) {
        console.error(`[ArenaTick] Error processing session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[ArenaTick] Error:', err.message);
  }
}

async function finalizeArenaSession(sessionId: string) {
  console.log(`[ArenaTick] Finalizing arena session ${sessionId}`);

  try {
    const gladiators = await db.select().from(arenaGladiators).where(eq(arenaGladiators.sessionId, sessionId));
    const results: { gladiatorId: string; finalReturn: number; winRate: number; equity: number[] }[] = [];

    for (const gladiator of gladiators) {
      const state = getOrCreateState(gladiator.id);

      for (const [symbol, pos] of state.positions) {
        const priceData = await getPrice(symbol);
        if (priceData) state.balance += pos.amount * priceData.price;
      }
      state.positions.clear();

      const initialBalance = 10_000;
      const finalReturn = ((state.balance - initialBalance) / initialBalance) * 100;
      const winRate = state.trades > 0 ? (state.wins / state.trades) * 100 : 0;
      state.equityCurve.push(state.balance);

      results.push({ gladiatorId: gladiator.id, finalReturn, winRate, equity: state.equityCurve });
    }

    results.sort((a, b) => b.finalReturn - a.finalReturn);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      await db
        .update(arenaGladiators)
        .set({
          rank: i + 1,
          finalReturn: r.finalReturn.toFixed(4),
          winRate: r.winRate.toFixed(2),
          equityData: r.equity,
          isWinner: i === 0,
        })
        .where(eq(arenaGladiators.id, r.gladiatorId));

      gladiatorStates.delete(r.gladiatorId);
    }

    await db
      .update(arenaSessions)
      .set({ status: 'completed', endedAt: new Date() })
      .where(eq(arenaSessions.id, sessionId));

    console.log(`[ArenaTick] Session ${sessionId} completed. Winner: gladiator ${results[0]?.gladiatorId} with ${results[0]?.finalReturn.toFixed(2)}% return`);
  } catch (err: any) {
    console.error(`[ArenaTick] Error finalizing session ${sessionId}:`, err.message);
  }
}

export async function startArenaTickJob() {
  setInterval(processArenaTick, 5_000); // 5 seconds
  console.log('[ArenaTick] Job started - runs every 5 seconds');
}
