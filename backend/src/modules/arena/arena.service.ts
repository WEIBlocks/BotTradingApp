import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { arenaSessions, arenaGladiators } from '../../db/schema/arena.js';
import { bots, botStatistics, botSubscriptions } from '../../db/schema/bots.js';
import { botPositions } from '../../db/schema/positions.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { NotFoundError, ConflictError, AppError } from '../../lib/errors.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BOTS_PER_SESSION = 5;
const MAX_CONCURRENT_SESSIONS = 3;
const MAX_DURATION_SECONDS = 86400; // 24 hours max
const MAX_SESSIONS_PER_DAY = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if the US stock market is currently open (Mon–Fri 9:30–16:00 ET)
 *  Uses UTC-based calculation — server timezone independent.
 *  DST approximation: March(2)–October(9) = EDT (UTC-4), else EST (UTC-5).
 */
export function isUSMarketOpen(): boolean {
  const now = new Date();
  const month = now.getUTCMonth(); // 0=Jan
  const isDST = month >= 2 && month <= 9; // Mar–Oct = EDT
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Market open in UTC: 13:30 EDT (17:30 UTC? no — EDT=UTC-4 so 9:30ET=13:30UTC)
  const openMinutes  = isDST ? (13 * 60 + 30) : (14 * 60 + 30);
  const closeMinutes = isDST ? (20 * 60)       : (21 * 60);
  // Day of week in ET
  const utcDay = now.getUTCDay();
  // Adjust day for ET offset at market open (13:30 UTC or 14:30 UTC is always same calendar day as ET)
  if (utcDay === 0 || utcDay === 6) return false;
  // Also block Friday after close and handle Mon before open
  return utcMinutes >= openMinutes && utcMinutes < closeMinutes;
}

/** Detect bot asset class from its config pairs */
function getBotAssetClass(config: any): 'crypto' | 'stocks' | 'mixed' {
  const pairs: string[] = config?.pairs ?? [];
  if (pairs.length === 0) return 'crypto'; // default
  const stockPairs = pairs.filter(p => !p.includes('/'));
  const cryptoPairs = pairs.filter(p => p.includes('/'));
  if (stockPairs.length > 0 && cryptoPairs.length > 0) return 'mixed';
  if (stockPairs.length > 0) return 'stocks';
  return 'crypto';
}

// ─── Get Available Bots ─────────────────────────────────────────────────────

export async function getAvailableBots(userId: string) {
  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      config: bots.config,
      creatorId: bots.creatorId,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      avgRating: botStatistics.avgRating,
      activeUsers: botStatistics.activeUsers,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(sql`${bots.isPublished} = true OR ${bots.creatorId} = ${userId}`);

  // Enrich with asset class detection
  return rows.map(r => ({
    ...r,
    assetClass: getBotAssetClass(r.config),
  }));
}

// ─── Create Session ─────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  botIds: string[],
  durationSeconds: number = 180,
  mode: 'shadow' | 'live' = 'shadow',
  virtualBalance: number = 10000,
  cryptoBalance?: number,
  stockBalance?: number,
) {
  // ── Basic validation ──
  if (botIds.length < 2) throw new AppError(400, 'Select at least 2 bots for the arena battle.');
  if (botIds.length > MAX_BOTS_PER_SESSION) throw new AppError(400, `Maximum ${MAX_BOTS_PER_SESSION} bots per battle.`);
  if (durationSeconds > MAX_DURATION_SECONDS) throw new AppError(400, 'Maximum battle duration is 24 hours.');
  if (durationSeconds < 60) throw new AppError(400, 'Minimum battle duration is 1 minute.');

  // ── Concurrent / daily rate limits ──
  const [concurrentCount]: any = await db.execute(sql`
    SELECT count(*)::int as cnt FROM arena_sessions
    WHERE user_id = ${userId} AND status = 'running'
  `);
  if ((concurrentCount?.rows?.[0]?.cnt ?? 0) >= MAX_CONCURRENT_SESSIONS) {
    throw new ConflictError(`Maximum ${MAX_CONCURRENT_SESSIONS} concurrent arena battles allowed.`);
  }
  const [dailyCount]: any = await db.execute(sql`
    SELECT count(*)::int as cnt FROM arena_sessions
    WHERE user_id = ${userId} AND created_at >= now() - interval '24 hours'
  `);
  if ((dailyCount?.rows?.[0]?.cnt ?? 0) >= MAX_SESSIONS_PER_DAY) {
    throw new AppError(429, `Maximum ${MAX_SESSIONS_PER_DAY} arena battles per day.`);
  }

  // ── Fetch bot configs to detect asset classes ──
  const botRows = await Promise.all(botIds.map(async (botId) => {
    const [bot] = await db.select({
      id: bots.id,
      isPublished: bots.isPublished,
      creatorId: bots.creatorId,
      category: bots.category,
      config: bots.config,
    }).from(bots).where(eq(bots.id, botId));
    if (!bot) throw new NotFoundError(`Bot ${botId.slice(0, 8)}`);
    if (!bot.isPublished && bot.creatorId !== userId) {
      throw new AppError(403, 'You can only use published bots or your own bots in arena.');
    }
    return bot;
  }));

  // ── Detect session type: crypto-only, stocks-only, or mixed ──
  const assetClasses = botRows.map(b => getBotAssetClass(b.config as any));
  const hasCrypto = assetClasses.some(a => a === 'crypto' || a === 'mixed');
  const hasStocks = assetClasses.some(a => a === 'stocks' || a === 'mixed');
  const isMixed = hasCrypto && hasStocks;

  // ── Balance handling ──
  let finalCryptoBalance: number | undefined;
  let finalStockBalance: number | undefined;
  let totalVirtualBalance: number;

  if (mode === 'live') {
    // Live: fetch real exchange balances and validate
    const connections = await db.select().from(exchangeConnections)
      .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')));

    const cryptoConn = connections.find(c => c.assetClass === 'crypto' || c.provider === 'binance');
    const stockConn = connections.find(c => c.assetClass === 'stocks' || c.provider === 'alpaca');

    if (hasCrypto && !cryptoConn) {
      throw new AppError(400, 'Connect your crypto exchange (e.g. Binance) first to include crypto bots in a live arena battle.');
    }
    if (hasStocks && !stockConn) {
      throw new AppError(400, 'Connect your stock broker (e.g. Alpaca) first to include stock bots in a live arena battle.');
    }

    const availableCrypto = cryptoConn ? parseFloat(cryptoConn.totalBalance ?? '0') : 0;
    const availableStocks = stockConn ? parseFloat(stockConn.totalBalance ?? '0') : 0;

    if (hasCrypto) {
      const wantedCrypto = cryptoBalance ?? virtualBalance;
      if (wantedCrypto > availableCrypto) {
        throw new AppError(400, `Insufficient crypto balance. Available: $${availableCrypto.toFixed(2)}, requested: $${wantedCrypto.toFixed(2)}.`);
      }
      if (wantedCrypto < 10) throw new AppError(400, 'Minimum $10 crypto balance for live arena.');
      finalCryptoBalance = wantedCrypto;
    }
    if (hasStocks) {
      const wantedStock = stockBalance ?? virtualBalance;
      if (wantedStock > availableStocks) {
        throw new AppError(400, `Insufficient stock balance. Available: $${availableStocks.toFixed(2)}, requested: $${wantedStock.toFixed(2)}.`);
      }
      if (wantedStock < 10) throw new AppError(400, 'Minimum $10 stock balance for live arena.');
      finalStockBalance = wantedStock;
    }

    // Total virtual balance = crypto + stock pools (for display)
    totalVirtualBalance = (finalCryptoBalance ?? 0) + (finalStockBalance ?? 0);
  } else {
    // Shadow mode
    if (isMixed) {
      // Mixed: use separate crypto/stock balances if provided, else split virtualBalance
      finalCryptoBalance = cryptoBalance ?? virtualBalance / 2;
      finalStockBalance = stockBalance ?? virtualBalance / 2;
      totalVirtualBalance = finalCryptoBalance + finalStockBalance;
    } else if (hasStocks) {
      finalStockBalance = virtualBalance;
      totalVirtualBalance = virtualBalance;
    } else {
      finalCryptoBalance = virtualBalance;
      totalVirtualBalance = virtualBalance;
    }
    if (totalVirtualBalance < 100) throw new AppError(400, 'Minimum virtual balance is $100.');
  }

  // ── Per-bot allocation: shared pool divided equally ──
  // Crypto bots share the crypto pool; stock bots share the stock pool.
  // Mixed bots (crypto+stock pairs) are counted in BOTH pools and get alloc from both.
  const pureOrMixedCryptoCount = botRows.filter(b => {
    const ac = getBotAssetClass(b.config as any);
    return ac === 'crypto' || ac === 'mixed';
  }).length || 1;
  const pureOrMixedStockCount = botRows.filter(b => {
    const ac = getBotAssetClass(b.config as any);
    return ac === 'stocks' || ac === 'mixed';
  }).length || 1;

  const perCryptoBotAlloc = hasCrypto ? (finalCryptoBalance ?? 0) / pureOrMixedCryptoCount : 0;
  const perStockBotAlloc = hasStocks ? (finalStockBalance ?? 0) / pureOrMixedStockCount : 0;
  // For display: primary per-bot alloc (crypto-only → crypto alloc, stocks-only → stock alloc, mixed → sum)
  const perBotAllocation = isMixed ? (perCryptoBotAlloc + perStockBotAlloc) : (hasCrypto ? perCryptoBotAlloc : perStockBotAlloc);

  // ── Create session record ──
  const [session] = await db.insert(arenaSessions).values({
    userId,
    status: 'running',
    mode,
    durationSeconds,
    virtualBalance: totalVirtualBalance.toFixed(2),
    cryptoBalance: finalCryptoBalance != null ? finalCryptoBalance.toFixed(2) : null,
    stockBalance: finalStockBalance != null ? finalStockBalance.toFixed(2) : null,
    hasCrypto,
    hasStocks,
    isMixed,
    perBotAllocation: perBotAllocation.toFixed(2),
    startedAt: new Date(),
  }).returning();

  // ── Create gladiator records — each with their own allocation ──
  const gladiatorValues = botIds.map((botId) => {
    const botConfig = botRows.find(b => b.id === botId)?.config as any;
    const ac = getBotAssetClass(botConfig);
    // Mixed bots get alloc from both pools; pure bots get alloc from their pool only
    const alloc = ac === 'mixed'
      ? perCryptoBotAlloc + perStockBotAlloc
      : ac === 'stocks' ? perStockBotAlloc : perCryptoBotAlloc;
    return {
      sessionId: session.id,
      botId,
      equityData: [alloc] as number[],
    };
  });

  const gladiators = await db.insert(arenaGladiators).values(gladiatorValues).returning();

  return {
    ...session,
    gladiators,
    perBotAllocation,
    perCryptoBotAlloc,
    perStockBotAlloc,
    isMixed,
    hasCrypto,
    hasStocks,
  };
}

// ─── Get Session ────────────────────────────────────────────────────────────

export async function getSession(sessionId: string, userId: string) {
  const [session] = await db.select().from(arenaSessions)
    .where(and(eq(arenaSessions.id, sessionId), eq(arenaSessions.userId, userId)))
    .limit(1);

  if (!session) throw new NotFoundError('Arena session');

  const gladiators = await db
    .select({
      id: arenaGladiators.id,
      botId: arenaGladiators.botId,
      rank: arenaGladiators.rank,
      finalReturn: arenaGladiators.finalReturn,
      winRate: arenaGladiators.winRate,
      totalTrades: arenaGladiators.totalTrades,
      totalPnl: arenaGladiators.totalPnl,
      equityData: arenaGladiators.equityData,
      decisionLog: arenaGladiators.decisionLog,
      isWinner: arenaGladiators.isWinner,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botCategory: bots.category,
      botAvatar: bots.avatarLetter,
      botColor: bots.avatarColor,
      botRiskLevel: bots.riskLevel,
      botConfig: bots.config,
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const sessionStartDate = session.startedAt ? new Date(session.startedAt) : new Date();
  const elapsed = (Date.now() - startedAt) / 1000;
  const duration = session.durationSeconds ?? 180;
  const progress = Math.min(elapsed / duration, 1);

  const totalPool = parseFloat(session.virtualBalance ?? '10000');
  const isMixed = session.isMixed ?? false;
  const marketOpen = isUSMarketOpen();
  const isLiveMode = session.mode === 'live';

  // Enrich each gladiator with real position data scoped to this session
  const enrichedGladiators = await Promise.all(gladiators.map(async (g) => {
    const botConfig = (g.botConfig ?? {}) as any;
    const assetClass = getBotAssetClass(botConfig);
    const isStockBot = assetClass === 'stocks';

    // Determine this bot's starting allocation
    const startingAlloc = Array.isArray(g.equityData) && (g.equityData as number[]).length > 0
      ? (g.equityData as number[])[0]
      : totalPool;

    const positions = await db.select().from(botPositions)
      .where(and(
        eq(botPositions.botId, g.botId),
        eq(botPositions.userId, userId),
        eq(botPositions.isPaper, !isLiveMode),
        eq(botPositions.shadowSessionId, g.id), // scoped to this gladiator slot
      ))
      .orderBy(desc(botPositions.openedAt));

    const closed = positions.filter(p => p.status === 'closed');
    const open = positions.filter(p => p.status === 'open');
    const realizedPnl = closed.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
    const wins = closed.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

    const trades = positions.map(pos => ({
      symbol: pos.symbol,
      status: pos.status,
      entryPrice: parseFloat(pos.entryPrice),
      exitPrice: pos.exitPrice ? parseFloat(pos.exitPrice) : null,
      amount: parseFloat(pos.amount),
      entryValue: parseFloat(pos.entryValue ?? '0'),
      exitValue: pos.exitValue ? parseFloat(pos.exitValue) : null,
      pnl: pos.pnl ? parseFloat(pos.pnl) : null,
      pnlPercent: pos.pnlPercent ? parseFloat(pos.pnlPercent) : null,
      entryReasoning: pos.entryReasoning,
      exitReasoning: pos.exitReasoning,
      openedAt: pos.openedAt,
      closedAt: pos.closedAt,
    }));

    return {
      ...g,
      assetClass,
      isStockBot,
      marketOpen: isStockBot ? marketOpen : true, // crypto always open
      startingAlloc,
      currentReturn: g.finalReturn ? parseFloat(g.finalReturn) : 0,
      currentWinRate: winRate,
      currentTrades: closed.length + open.length,
      currentPnl: g.totalPnl ? parseFloat(g.totalPnl) : realizedPnl,
      currentWins: wins,
      currentLosses: closed.length - wins,
      openPositionCount: open.length,
      closedPositionCount: closed.length,
      category: g.botCategory,
      trades,
    };
  }));

  return {
    ...session,
    gladiators: enrichedGladiators,
    progress,
    elapsedSeconds: Math.floor(elapsed),
    remainingSeconds: Math.max(0, Math.floor(duration - elapsed)),
    virtualBalance: session.virtualBalance,
    cryptoBalance: session.cryptoBalance,
    stockBalance: session.stockBalance,
    isMixed,
    hasCrypto: session.hasCrypto,
    hasStocks: session.hasStocks,
    perBotAllocation: session.perBotAllocation,
    marketOpen,
  };
}

// ─── Get Active Session ─────────────────────────────────────────────────────

export async function getActiveSession(userId: string) {
  const [session] = await db.select().from(arenaSessions)
    .where(and(eq(arenaSessions.userId, userId), eq(arenaSessions.status, 'running')))
    .orderBy(desc(arenaSessions.startedAt))
    .limit(1);

  if (!session) return null;
  return getSession(session.id, userId);
}

// ─── History ────────────────────────────────────────────────────────────────

export async function getHistory(userId: string) {
  const sessions = await db.select().from(arenaSessions)
    .where(eq(arenaSessions.userId, userId))
    .orderBy(desc(arenaSessions.startedAt))
    .limit(20);

  const results = await Promise.all(sessions.map(async (session) => {
    const gladiators = await db
      .select({
        botId: arenaGladiators.botId,
        rank: arenaGladiators.rank,
        finalReturn: arenaGladiators.finalReturn,
        totalTrades: arenaGladiators.totalTrades,
        isWinner: arenaGladiators.isWinner,
        botName: bots.name,
        botColor: bots.avatarColor,
        botStrategy: bots.strategy,
      })
      .from(arenaGladiators)
      .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
      .where(eq(arenaGladiators.sessionId, session.id));

    const winner = gladiators.find(g => g.isWinner) ||
      gladiators.sort((a, b) => parseFloat(b.finalReturn ?? '0') - parseFloat(a.finalReturn ?? '0'))[0];

    return {
      id: session.id,
      status: session.status,
      mode: session.mode,
      durationSeconds: session.durationSeconds,
      virtualBalance: session.virtualBalance,
      isMixed: session.isMixed,
      hasCrypto: session.hasCrypto,
      hasStocks: session.hasStocks,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      botCount: gladiators.length,
      winnerName: winner?.botName ?? null,
      winnerReturn: winner?.finalReturn ?? null,
      winnerColor: winner?.botColor ?? null,
      winnerStrategy: winner?.botStrategy ?? null,
      totalTrades: gladiators.reduce((sum, g) => sum + (g.totalTrades ?? 0), 0),
    };
  }));

  return results;
}

// ─── Get Results ────────────────────────────────────────────────────────────

export async function getSessionResults(sessionId: string, userId: string) {
  const [session] = await db.select().from(arenaSessions)
    .where(and(eq(arenaSessions.id, sessionId), eq(arenaSessions.userId, userId)))
    .limit(1);

  if (!session) throw new NotFoundError('Arena session');

  const gladiators = await db
    .select({
      id: arenaGladiators.id,
      botId: arenaGladiators.botId,
      rank: arenaGladiators.rank,
      finalReturn: arenaGladiators.finalReturn,
      winRate: arenaGladiators.winRate,
      totalTrades: arenaGladiators.totalTrades,
      totalPnl: arenaGladiators.totalPnl,
      equityData: arenaGladiators.equityData,
      decisionLog: arenaGladiators.decisionLog,
      isWinner: arenaGladiators.isWinner,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botCategory: bots.category,
      botAvatar: bots.avatarLetter,
      botColor: bots.avatarColor,
      botRiskLevel: bots.riskLevel,
      botConfig: bots.config,
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  const sessionStart = session.startedAt ? new Date(session.startedAt) : new Date();
  const isLiveSession = session.mode === 'live';

  const enriched = await Promise.all(gladiators.map(async (g) => {
    const log = Array.isArray(g.decisionLog) ? g.decisionLog as any[] : [];
    const equity = Array.isArray(g.equityData) ? g.equityData as number[] : [];
    const botConfig = (g.botConfig ?? {}) as any;
    const assetClass = getBotAssetClass(botConfig);

    // Starting allocation from first equity point
    const startingAlloc = equity.length > 0 ? equity[0] : parseFloat(session.perBotAllocation ?? '10000');

    const dbPositions = await db.select().from(botPositions)
      .where(and(
        eq(botPositions.botId, g.botId),
        eq(botPositions.userId, userId),
        eq(botPositions.isPaper, !isLiveSession),
        eq(botPositions.shadowSessionId, g.id), // scoped to this gladiator slot
      ))
      .orderBy(botPositions.openedAt);

    const closedPos = dbPositions.filter(p => p.status === 'closed');
    const openPos = dbPositions.filter(p => p.status === 'open');

    const trades = dbPositions.map(pos => {
      const entryPrice = parseFloat(pos.entryPrice);
      const exitPrice = pos.exitPrice ? parseFloat(pos.exitPrice) : 0;
      const pnlPct = pos.pnlPercent ? parseFloat(pos.pnlPercent) : 0;
      return {
        symbol: pos.symbol,
        entryPrice,
        exitPrice,
        pnl: pos.pnl ? parseFloat(pos.pnl) : 0,
        pnlPercent: Math.round(pnlPct * 100) / 100,
        entryReasoning: pos.entryReasoning || '',
        exitReasoning: pos.exitReasoning || '',
        entryTime: pos.openedAt ? new Date(pos.openedAt).toISOString() : '',
        exitTime: pos.closedAt ? new Date(pos.closedAt).toISOString() : '',
        isOpen: pos.status === 'open',
      };
    });

    const completedTrades = trades.filter(t => !t.isOpen);
    const winTrades = completedTrades.filter(t => t.pnlPercent > 0);
    const lossTrades = completedTrades.filter(t => t.pnlPercent <= 0);
    const calcWinRate = completedTrades.length > 0 ? (winTrades.length / completedTrades.length) * 100 : 0;
    const avgWinPct = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnlPercent, 0) / winTrades.length : 0;
    const avgLossPct = lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + t.pnlPercent, 0) / lossTrades.length : 0;
    const bestTrade = completedTrades.length > 0 ? completedTrades.reduce((b, t) => t.pnlPercent > b.pnlPercent ? t : b) : null;
    const worstTrade = completedTrades.length > 0 ? completedTrades.reduce((w, t) => t.pnlPercent < w.pnlPercent ? t : w) : null;

    const realizedPnl = closedPos.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
    const lastEquity = equity.length > 0 ? equity[equity.length - 1] : startingAlloc;
    const equityPnl = lastEquity - startingAlloc;
    const finalPnl = Math.abs(realizedPnl) > 0.001 ? realizedPnl : equityPnl;
    // Return % is relative to THIS BOT'S allocation (not total pool)
    const finalRet = startingAlloc > 0 ? (finalPnl / startingAlloc) * 100 : 0;

    let botPeak = 0, botMaxDD = 0;
    for (const val of equity) {
      if (val > botPeak) botPeak = val;
      const dd = botPeak > 0 ? ((botPeak - val) / botPeak) * 100 : 0;
      if (dd > botMaxDD) botMaxDD = dd;
    }

    const storedWr = parseFloat(g.winRate ?? '0');
    const logBuys = log.filter((d: any) => d.action === 'BUY').length;
    const logSells = log.filter((d: any) => d.action === 'SELL').length;
    const logHolds = log.filter((d: any) => d.action === 'HOLD').length;

    return {
      ...g,
      assetClass,
      startingAlloc,
      totalTrades: closedPos.length + openPos.length,
      totalPnl: finalPnl.toFixed(2),
      finalReturn: finalRet.toFixed(4),
      winRate: (calcWinRate > 0 ? calcWinRate : storedWr).toFixed(2),
      lastEquity: lastEquity.toFixed(2),
      tradeBreakdown: {
        buys: logBuys,
        sells: logSells,
        holds: logHolds,
        total: closedPos.length + openPos.length,
        closedCount: closedPos.length,
        openCount: openPos.length,
      },
      trades: trades.slice(0, 100),
      detailedStats: {
        completedTrades: completedTrades.length,
        openTrades: openPos.length,
        wins: winTrades.length,
        losses: lossTrades.length,
        winRate: calcWinRate,
        avgWinPercent: Math.round(avgWinPct * 100) / 100,
        avgLossPercent: Math.round(avgLossPct * 100) / 100,
        maxDrawdown: Math.round(botMaxDD * 100) / 100,
        bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnlPercent: bestTrade.pnlPercent } : null,
        worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnlPercent: worstTrade.pnlPercent } : null,
      },
    };
  }));

  const ranked = enriched.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    return parseFloat(b.finalReturn ?? '0') - parseFloat(a.finalReturn ?? '0');
  });

  const winner = ranked.find(g => g.isWinner) || ranked[0];
  const totalTrades = ranked.reduce((s, g) => s + (g.totalTrades ?? 0), 0);
  const totalPnl = ranked.reduce((s, g) => s + parseFloat(g.totalPnl ?? '0'), 0);
  const bestReturn = Math.max(...ranked.map(g => parseFloat(g.finalReturn ?? '0')));
  const worstReturn = Math.min(...ranked.map(g => parseFloat(g.finalReturn ?? '0')));
  const avgReturn = ranked.length > 0 ? ranked.reduce((s, g) => s + parseFloat(g.finalReturn ?? '0'), 0) / ranked.length : 0;
  const logBuysTotal = ranked.reduce((s, g) => s + (g.tradeBreakdown?.buys ?? 0), 0);
  const logSellsTotal = ranked.reduce((s, g) => s + (g.tradeBreakdown?.sells ?? 0), 0);

  return {
    session: {
      id: session.id,
      status: session.status,
      mode: session.mode,
      durationSeconds: session.durationSeconds,
      virtualBalance: session.virtualBalance,
      cryptoBalance: session.cryptoBalance,
      stockBalance: session.stockBalance,
      isMixed: session.isMixed,
      hasCrypto: session.hasCrypto,
      hasStocks: session.hasStocks,
      perBotAllocation: session.perBotAllocation,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
    stats: {
      totalTrades,
      totalBuys: logBuysTotal,
      totalSells: logSellsTotal,
      totalPnl: totalPnl.toFixed(2),
      virtualBalance: parseFloat(session.virtualBalance ?? '10000').toFixed(2),
      cryptoBalance: session.cryptoBalance,
      stockBalance: session.stockBalance,
      bestReturn: bestReturn.toFixed(2),
      worstReturn: worstReturn.toFixed(2),
      botCount: ranked.length,
      avgReturn: avgReturn.toFixed(2),
    },
    winner: winner ? {
      ...winner,
      currentReturn: parseFloat(winner.finalReturn ?? '0'),
    } : null,
    rankings: ranked.map(g => ({
      ...g,
      currentReturn: parseFloat(g.finalReturn ?? '0'),
      currentWinRate: parseFloat(g.winRate ?? '0'),
    })),
    totalGladiators: ranked.length,
  };
}
