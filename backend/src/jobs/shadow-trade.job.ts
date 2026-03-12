import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { createQueue, createWorker, redisConnection } from '../config/queue.js';
import { shadowSessions, bots } from '../db/schema/bots';
import { trades } from '../db/schema/trades';
import { getPrice } from './price-sync.job.js';

const shadowTradeQueue = createQueue('shadow-trade');

// In-memory moving average buffers per session+symbol
const priceHistory: Map<string, number[]> = new Map();

interface BotConfig {
  pairs?: string[];
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  tradingMode?: string;
}

interface SessionPosition {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  entryTime: number;
}

// In-memory positions per session (reset on restart -- acceptable for simulation)
const sessionPositions: Map<string, SessionPosition[]> = new Map();

function getPositions(sessionId: string): SessionPosition[] {
  if (!sessionPositions.has(sessionId)) {
    sessionPositions.set(sessionId, []);
  }
  return sessionPositions.get(sessionId)!;
}

function addPriceToHistory(key: string, price: number, maxLen: number = 20): number[] {
  if (!priceHistory.has(key)) {
    priceHistory.set(key, []);
  }
  const hist = priceHistory.get(key)!;
  hist.push(price);
  if (hist.length > maxLen) hist.shift();
  return hist;
}

function simpleMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function simulateMomentum(
  sessionId: string,
  symbol: string,
  currentPrice: number,
  balance: number,
  maxPositionPct: number,
): Promise<{ side: 'BUY' | 'SELL'; amount: number; reasoning: string } | null> {
  const histKey = `${sessionId}:${symbol}`;
  const prices = addPriceToHistory(histKey, currentPrice);
  const ma20 = simpleMA(prices, 20);

  const positions = getPositions(sessionId);
  const existingPos = positions.find((p) => p.symbol === symbol);

  if (!ma20) return null; // Not enough data yet

  if (currentPrice > ma20 && !existingPos) {
    const tradeValue = balance * maxPositionPct;
    const amount = tradeValue / currentPrice;
    positions.push({
      symbol,
      side: 'long',
      entryPrice: currentPrice,
      amount,
      entryTime: Date.now(),
    });
    return { side: 'BUY', amount, reasoning: `Momentum: price ${currentPrice.toFixed(2)} above MA20 ${ma20.toFixed(2)}` };
  }

  if (currentPrice < ma20 && existingPos) {
    const idx = positions.indexOf(existingPos);
    positions.splice(idx, 1);
    return { side: 'SELL', amount: existingPos.amount, reasoning: `Momentum: price ${currentPrice.toFixed(2)} below MA20 ${ma20.toFixed(2)}` };
  }

  return null;
}

async function simulateScalping(
  sessionId: string,
  symbol: string,
  currentPrice: number,
  balance: number,
  maxPositionPct: number,
): Promise<{ side: 'BUY' | 'SELL'; amount: number; reasoning: string } | null> {
  const positions = getPositions(sessionId);
  const existingPos = positions.find((p) => p.symbol === symbol);

  if (existingPos) {
    const pnlPct = ((currentPrice - existingPos.entryPrice) / existingPos.entryPrice) * 100;
    // Take profit at 0.5-1% or stop loss at -0.5%
    if (pnlPct >= 0.5 + Math.random() * 0.5) {
      const idx = positions.indexOf(existingPos);
      positions.splice(idx, 1);
      return { side: 'SELL', amount: existingPos.amount, reasoning: `Scalp TP: ${pnlPct.toFixed(2)}% profit` };
    }
    if (pnlPct <= -0.5) {
      const idx = positions.indexOf(existingPos);
      positions.splice(idx, 1);
      return { side: 'SELL', amount: existingPos.amount, reasoning: `Scalp SL: ${pnlPct.toFixed(2)}% loss` };
    }
    return null;
  }

  // Enter trade with ~30% probability each tick
  if (Math.random() < 0.3) {
    const tradeValue = balance * maxPositionPct * 0.5;
    const amount = tradeValue / currentPrice;
    positions.push({
      symbol,
      side: 'long',
      entryPrice: currentPrice,
      amount,
      entryTime: Date.now(),
    });
    return { side: 'BUY', amount, reasoning: `Scalp entry at ${currentPrice.toFixed(2)}` };
  }

  return null;
}

async function simulateGrid(
  sessionId: string,
  symbol: string,
  currentPrice: number,
  balance: number,
  maxPositionPct: number,
): Promise<{ side: 'BUY' | 'SELL'; amount: number; reasoning: string } | null> {
  const histKey = `grid:${sessionId}:${symbol}`;
  const lastPriceStr = await redisConnection.get(histKey);
  await redisConnection.set(histKey, currentPrice.toString(), 'EX', 3600);

  if (!lastPriceStr) return null;
  const lastPrice = parseFloat(lastPriceStr);
  const gridInterval = lastPrice * 0.01; // 1% grid

  const positions = getPositions(sessionId);
  const existingPos = positions.find((p) => p.symbol === symbol);

  if (currentPrice <= lastPrice - gridInterval && !existingPos) {
    const tradeValue = balance * maxPositionPct * 0.3;
    const amount = tradeValue / currentPrice;
    positions.push({
      symbol,
      side: 'long',
      entryPrice: currentPrice,
      amount,
      entryTime: Date.now(),
    });
    return { side: 'BUY', amount, reasoning: `Grid buy at ${currentPrice.toFixed(2)} (grid interval ${gridInterval.toFixed(2)})` };
  }

  if (currentPrice >= lastPrice + gridInterval && existingPos) {
    const idx = positions.indexOf(existingPos);
    positions.splice(idx, 1);
    return { side: 'SELL', amount: existingPos.amount, reasoning: `Grid sell at ${currentPrice.toFixed(2)}` };
  }

  return null;
}

async function simulateDCA(
  sessionId: string,
  symbol: string,
  currentPrice: number,
  balance: number,
  maxPositionPct: number,
): Promise<{ side: 'BUY' | 'SELL'; amount: number; reasoning: string } | null> {
  const dcaKey = `dca:${sessionId}:${symbol}:lastBuy`;
  const lastBuyStr = await redisConnection.get(dcaKey);
  const now = Date.now();

  // DCA every ~10 minutes (5 ticks at 2min intervals)
  if (!lastBuyStr || now - parseInt(lastBuyStr) > 600_000) {
    const tradeValue = balance * maxPositionPct * 0.1; // Small regular buys
    const amount = tradeValue / currentPrice;
    await redisConnection.set(dcaKey, now.toString(), 'EX', 86400);

    const positions = getPositions(sessionId);
    positions.push({
      symbol,
      side: 'long',
      entryPrice: currentPrice,
      amount,
      entryTime: now,
    });

    return { side: 'BUY', amount, reasoning: `DCA buy at ${currentPrice.toFixed(2)}` };
  }

  return null;
}

async function simulateTrendFollowing(
  sessionId: string,
  symbol: string,
  currentPrice: number,
  balance: number,
  maxPositionPct: number,
): Promise<{ side: 'BUY' | 'SELL'; amount: number; reasoning: string } | null> {
  const histKey = `${sessionId}:trend:${symbol}`;
  const prices = addPriceToHistory(histKey, currentPrice);
  const positions = getPositions(sessionId);
  const existingPos = positions.find((p) => p.symbol === symbol);

  if (prices.length < 5) return null;

  // Detect breakout: current price > highest of last 10 periods
  const recentHigh = Math.max(...prices.slice(-10));
  const recentLow = Math.min(...prices.slice(-10));

  if (currentPrice >= recentHigh && !existingPos) {
    const tradeValue = balance * maxPositionPct;
    const amount = tradeValue / currentPrice;
    positions.push({
      symbol,
      side: 'long',
      entryPrice: currentPrice,
      amount,
      entryTime: Date.now(),
    });
    return { side: 'BUY', amount, reasoning: `Trend breakout: price at ${prices.length}-period high ${currentPrice.toFixed(2)}` };
  }

  // Trailing stop: sell if price drops 2% from entry
  if (existingPos) {
    const drawdown = ((currentPrice - existingPos.entryPrice) / existingPos.entryPrice) * 100;
    if (drawdown <= -2.0 || currentPrice <= recentLow) {
      const idx = positions.indexOf(existingPos);
      positions.splice(idx, 1);
      return { side: 'SELL', amount: existingPos.amount, reasoning: `Trend trailing stop: ${drawdown.toFixed(2)}% drawdown` };
    }
  }

  return null;
}

async function simulateTradeForStrategy(
  strategy: string,
  sessionId: string,
  symbol: string,
  price: number,
  balance: number,
  maxPositionPct: number,
) {
  const stratLower = strategy.toLowerCase();

  if (stratLower.includes('momentum')) {
    return simulateMomentum(sessionId, symbol, price, balance, maxPositionPct);
  }
  if (stratLower.includes('scalp')) {
    return simulateScalping(sessionId, symbol, price, balance, maxPositionPct);
  }
  if (stratLower.includes('grid')) {
    return simulateGrid(sessionId, symbol, price, balance, maxPositionPct);
  }
  if (stratLower.includes('dca') || stratLower.includes('dollar')) {
    return simulateDCA(sessionId, symbol, price, balance, maxPositionPct);
  }
  if (stratLower.includes('trend')) {
    return simulateTrendFollowing(sessionId, symbol, price, balance, maxPositionPct);
  }

  // Default to momentum
  return simulateMomentum(sessionId, symbol, price, balance, maxPositionPct);
}

async function processShadowTrades() {
  console.log('[ShadowTrade] Processing active shadow sessions...');

  try {
    // Get all active/running shadow sessions
    const activeSessions = await db
      .select({
        session: shadowSessions,
        bot: bots,
      })
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
        // Check if session has expired
        if (new Date() >= new Date(session.endsAt)) {
          await db
            .update(shadowSessions)
            .set({ status: 'completed' })
            .where(eq(shadowSessions.id, session.id));
          console.log(`[ShadowTrade] Session ${session.id} completed (expired)`);
          continue;
        }

        const config = (bot.config ?? {}) as BotConfig;
        const pairs = config.pairs?.length
          ? config.pairs
          : ['BTC/USDT', 'ETH/USDT'];
        const maxPositionPct = config.maxPositionSize
          ? config.maxPositionSize / 100
          : 0.2;

        const currentBalance = parseFloat(session.currentBalance ?? session.virtualBalance);
        const feeRate = session.enableRealisticFees ? 0.001 : 0; // 0.1% fees

        let balanceDelta = 0;
        let newTrades = 0;
        let newWins = 0;

        for (const pair of pairs) {
          const priceData = await getPrice(pair);
          if (!priceData) continue;

          const signal = await simulateTradeForStrategy(
            bot.strategy,
            session.id,
            pair,
            priceData.price,
            currentBalance,
            maxPositionPct,
          );

          if (!signal) continue;

          const totalValue = signal.amount * priceData.price;
          const fee = totalValue * feeRate;
          let pnl: number | null = null;
          let pnlPercent: number | null = null;

          if (signal.side === 'SELL') {
            // Calculate P&L from entry price
            const positions = getPositions(session.id);
            // P&L is the trade value minus fees
            pnl = totalValue - fee;
            // For sell, we calculate actual P&L based on reasoning
            const entryMatch = signal.reasoning.match(/(\d+\.\d+)%/);
            if (entryMatch) {
              pnlPercent = parseFloat(entryMatch[1]);
              if (signal.reasoning.includes('loss') || signal.reasoning.includes('stop')) {
                pnlPercent = -Math.abs(pnlPercent);
              }
            } else {
              pnlPercent = ((totalValue - fee) / totalValue) * 100 - 100;
            }
            balanceDelta += pnl;
            if (pnl > 0) newWins++;
          } else {
            // BUY: deduct from balance
            balanceDelta -= (totalValue + fee);
          }

          // Insert trade record
          await db.insert(trades).values({
            userId: session.userId,
            shadowSessionId: session.id,
            symbol: pair,
            side: signal.side,
            amount: signal.amount.toFixed(8),
            price: priceData.price.toFixed(8),
            totalValue: totalValue.toFixed(2),
            pnl: pnl !== null ? pnl.toFixed(2) : null,
            pnlPercent: pnlPercent !== null ? pnlPercent.toFixed(4) : null,
            isPaper: true,
            reasoning: signal.reasoning,
            status: 'filled',
          });

          newTrades++;
        }

        // Update session balance and stats
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
  const existing = await shadowTradeQueue.getRepeatableJobs();
  for (const job of existing) {
    await shadowTradeQueue.removeRepeatableByKey(job.key);
  }

  await shadowTradeQueue.add(
    'process-shadow-trades',
    {},
    {
      repeat: { every: 120_000 }, // 2 minutes
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 10 },
    },
  );

  createWorker('shadow-trade', async () => {
    await processShadowTrades();
  });

  console.log('[ShadowTrade] Job started - runs every 2 minutes');
}
