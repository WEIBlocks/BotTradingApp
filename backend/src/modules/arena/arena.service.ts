import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { arenaSessions, arenaGladiators } from '../../db/schema/arena.js';
import { bots, botStatistics, botSubscriptions } from '../../db/schema/bots.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { NotFoundError, ConflictError, AppError } from '../../lib/errors.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BOTS_PER_SESSION = 5;
const MAX_CONCURRENT_SESSIONS = 3;
const MAX_DURATION_SECONDS = 86400; // 24 hours max
const MAX_SESSIONS_PER_DAY = 10;

// ─── Get Available Bots ─────────────────────────────────────────────────────

export async function getAvailableBots(userId: string) {
  // Show published bots + user's own bots (even unpublished)
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

  return rows;
}

// ─── Create Session ─────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  botIds: string[],
  durationSeconds: number = 180,
  mode: 'shadow' | 'live' = 'shadow',
  virtualBalance: number = 10000,
) {
  // Validation: max bots
  if (botIds.length < 2) throw new AppError(400, 'Select at least 2 bots for the arena battle.');
  if (botIds.length > MAX_BOTS_PER_SESSION) throw new AppError(400, `Maximum ${MAX_BOTS_PER_SESSION} bots per battle.`);

  // Validation: max duration
  if (durationSeconds > MAX_DURATION_SECONDS) throw new AppError(400, 'Maximum battle duration is 24 hours.');
  if (durationSeconds < 60) throw new AppError(400, 'Minimum battle duration is 1 minute.');

  // Validation: concurrent sessions
  const [concurrentCount]: any = await db.execute(sql`
    SELECT count(*)::int as cnt FROM arena_sessions
    WHERE user_id = ${userId} AND status = 'running'
  `);
  if ((concurrentCount?.rows?.[0]?.cnt ?? 0) >= MAX_CONCURRENT_SESSIONS) {
    throw new ConflictError(`Maximum ${MAX_CONCURRENT_SESSIONS} concurrent arena battles allowed.`);
  }

  // Validation: daily rate limit
  const [dailyCount]: any = await db.execute(sql`
    SELECT count(*)::int as cnt FROM arena_sessions
    WHERE user_id = ${userId} AND created_at >= now() - interval '24 hours'
  `);
  if ((dailyCount?.rows?.[0]?.cnt ?? 0) >= MAX_SESSIONS_PER_DAY) {
    throw new AppError(429, `Maximum ${MAX_SESSIONS_PER_DAY} arena battles per day.`);
  }

  // Validation: bots exist and are accessible
  for (const botId of botIds) {
    const [bot] = await db.select({ id: bots.id, isPublished: bots.isPublished, creatorId: bots.creatorId })
      .from(bots).where(eq(bots.id, botId));
    if (!bot) throw new NotFoundError(`Bot ${botId.slice(0, 8)}`);
    if (!bot.isPublished && bot.creatorId !== userId) {
      throw new AppError(403, 'You can only use published bots or your own bots in arena.');
    }
  }

  // Live mode: verify user has exchange connection with sufficient balance
  if (mode === 'live') {
    const [conn] = await db.select().from(exchangeConnections)
      .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')))
      .limit(1);
    if (!conn) throw new AppError(400, 'Connect your exchange first to run live arena battles.');
    const totalBalance = parseFloat(conn.totalBalance ?? '0');
    if (totalBalance < 10) throw new AppError(400, 'Insufficient exchange balance for live arena battle.');
  }

  // Validation: shadow balance
  if (mode === 'shadow' && virtualBalance < 100) {
    throw new AppError(400, 'Minimum virtual balance is $100.');
  }

  const [session] = await db.insert(arenaSessions).values({
    userId,
    status: 'running',
    mode,
    durationSeconds,
    virtualBalance: virtualBalance.toFixed(2),
    startedAt: new Date(),
  }).returning();

  const gladiatorValues = botIds.map((botId) => ({
    sessionId: session.id,
    botId,
    equityData: [virtualBalance] as number[],
  }));

  const gladiators = await db.insert(arenaGladiators).values(gladiatorValues).returning();

  return { ...session, gladiators };
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
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const elapsed = (Date.now() - startedAt) / 1000;
  const duration = session.durationSeconds ?? 180;
  const progress = Math.min(elapsed / duration, 1);

  return {
    ...session,
    gladiators: gladiators.map(g => ({
      ...g,
      currentReturn: g.finalReturn ? parseFloat(g.finalReturn) : 0,
      currentWinRate: g.winRate ? parseFloat(g.winRate) : 0,
      currentTrades: g.totalTrades ?? 0,
      currentPnl: g.totalPnl ? parseFloat(g.totalPnl) : 0,
    })),
    progress,
    elapsedSeconds: Math.floor(elapsed),
    remainingSeconds: Math.max(0, Math.floor(duration - elapsed)),
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
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  const initialBalance = parseFloat(session.virtualBalance ?? '10000');

  // ALWAYS recalculate from decisionLog and equityData (stored DB values may be 0 from overflow)
  const enriched = gladiators.map(g => {
    const log = Array.isArray(g.decisionLog) ? g.decisionLog as any[] : [];
    const equity = Array.isArray(g.equityData) ? g.equityData as number[] : [];

    // Count trades from decision log
    const buys = log.filter((d: any) => d.action === 'BUY');
    const sells = log.filter((d: any) => d.action === 'SELL');
    const holds = log.filter((d: any) => d.action === 'HOLD');
    const tradeCount = buys.length + sells.length;

    // Calculate P&L from equity curve
    const lastEquity = equity.length > 0 ? equity[equity.length - 1] : initialBalance;
    const pnl = lastEquity - initialBalance;
    const ret = initialBalance > 0 ? ((lastEquity - initialBalance) / initialBalance) * 100 : 0;

    // Calculate buy/sell volumes from prices in decision log
    const totalBuyValue = buys.reduce((s: number, d: any) => s + (parseFloat(d.price) || 0), 0);
    const totalSellValue = sells.reduce((s: number, d: any) => s + (parseFloat(d.price) || 0), 0);

    // Use stored values only if they're non-zero AND we don't have better data
    const storedTrades = g.totalTrades ?? 0;
    const storedPnl = parseFloat(g.totalPnl ?? '0');
    const storedRet = parseFloat(g.finalReturn ?? '0');
    const storedWr = parseFloat(g.winRate ?? '0');

    const finalTrades = tradeCount > 0 ? tradeCount : storedTrades;
    const finalPnl = Math.abs(pnl) > 0.001 ? pnl : storedPnl;
    const finalRet = Math.abs(ret) > 0.001 ? ret : storedRet;
    const finalWr = storedWr > 0 ? storedWr : (sells.length > 0 ? (sells.filter((d: any) => parseFloat(d.price) > 0).length / sells.length * 100) : 0);

    return {
      ...g,
      totalTrades: finalTrades,
      totalPnl: finalPnl.toFixed(2),
      finalReturn: finalRet.toFixed(4),
      winRate: finalWr.toFixed(2),
      lastEquity: lastEquity.toFixed(2),
      tradeBreakdown: {
        buys: buys.length,
        sells: sells.length,
        holds: holds.length,
        total: tradeCount,
        totalBuyValue: totalBuyValue.toFixed(2),
        totalSellValue: totalSellValue.toFixed(2),
      },
    };
  });

  const ranked = enriched.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    return parseFloat(b.finalReturn ?? '0') - parseFloat(a.finalReturn ?? '0');
  });

  const winner = ranked.find(g => g.isWinner) || ranked[0];

  // Overall session stats
  const totalTrades = ranked.reduce((s, g) => s + (g.totalTrades ?? 0), 0);
  const totalBuys = ranked.reduce((s, g) => s + g.tradeBreakdown.buys, 0);
  const totalSells = ranked.reduce((s, g) => s + g.tradeBreakdown.sells, 0);
  const bestReturn = Math.max(...ranked.map(g => parseFloat(g.finalReturn ?? '0')));
  const worstReturn = Math.min(...ranked.map(g => parseFloat(g.finalReturn ?? '0')));
  const totalPnl = ranked.reduce((s, g) => s + parseFloat(g.totalPnl ?? '0'), 0);

  return {
    session: {
      id: session.id,
      status: session.status,
      mode: session.mode,
      durationSeconds: session.durationSeconds,
      virtualBalance: session.virtualBalance,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
    stats: {
      totalTrades,
      totalBuys,
      totalSells,
      totalPnl: totalPnl.toFixed(2),
      virtualBalance: initialBalance.toFixed(2),
      bestReturn: bestReturn.toFixed(2),
      worstReturn: worstReturn.toFixed(2),
      botCount: ranked.length,
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
