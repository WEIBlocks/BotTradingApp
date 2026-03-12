import { db } from '../../config/database.js';
import {
  bots,
  botStatistics,
  botSubscriptions,
  shadowSessions,
  reviews,
} from '../../db/schema/bots.js';
import { trades } from '../../db/schema/trades.js';
import { users } from '../../db/schema/users.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';

interface CreateBotData {
  name: string;
  strategy: string;
  category?: string;
  risk_level?: string;
  pairs?: string[];
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  tradingMode?: string;
}

export async function createBot(userId: string, data: CreateBotData) {
  const config = {
    pairs: data.pairs ?? [],
    stopLoss: data.stopLoss,
    takeProfit: data.takeProfit,
    maxPositionSize: data.maxPositionSize,
    tradingMode: data.tradingMode,
  };

  const [bot] = await db
    .insert(bots)
    .values({
      creatorId: userId,
      name: data.name,
      strategy: data.strategy,
      category: data.category as any,
      riskLevel: data.risk_level as any,
      config,
      status: 'draft',
      isPublished: false,
    })
    .returning();

  // Create initial statistics row
  await db.insert(botStatistics).values({ botId: bot.id });

  return bot;
}

export async function pauseBot(userId: string, botSubId: string) {
  const [sub] = await db
    .select()
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)));

  if (!sub) {
    throw new NotFoundError('Bot subscription');
  }

  const [updated] = await db
    .update(botSubscriptions)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)))
    .returning();

  return updated;
}

export async function stopBot(userId: string, botSubId: string) {
  const [sub] = await db
    .select()
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)));

  if (!sub) {
    throw new NotFoundError('Bot subscription');
  }

  const [updated] = await db
    .update(botSubscriptions)
    .set({ status: 'stopped', updatedAt: new Date() })
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)))
    .returning();

  return updated;
}

export async function resumeBot(userId: string, botSubId: string) {
  const [sub] = await db
    .select()
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)));

  if (!sub) {
    throw new NotFoundError('Bot subscription');
  }

  const [updated] = await db
    .update(botSubscriptions)
    .set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(botSubscriptions.id, botSubId), eq(botSubscriptions.userId, userId)))
    .returning();

  return updated;
}

export async function purchaseBot(userId: string, botId: string, mode: 'live' | 'paper') {
  // Check bot exists
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) {
    throw new NotFoundError('Bot');
  }

  // Check for existing active subscription
  const [existing] = await db
    .select()
    .from(botSubscriptions)
    .where(
      and(
        eq(botSubscriptions.userId, userId),
        eq(botSubscriptions.botId, botId),
      )
    );

  if (existing && (existing.status === 'active' || existing.status === 'shadow')) {
    throw new ConflictError('You already have an active subscription to this bot');
  }

  const [subscription] = await db
    .insert(botSubscriptions)
    .values({
      userId,
      botId,
      mode,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [botSubscriptions.userId, botSubscriptions.botId],
      set: {
        mode,
        status: 'active',
        updatedAt: new Date(),
      },
    })
    .returning();

  // Increment active users count
  await db
    .update(botStatistics)
    .set({
      activeUsers: sql`COALESCE(${botStatistics.activeUsers}, 0) + 1`,
      updatedAt: new Date(),
    })
    .where(eq(botStatistics.botId, botId));

  return subscription;
}

export async function startShadowMode(
  userId: string,
  botId: string,
  config: {
    virtualBalance: number;
    durationDays: number;
    enableRiskLimits?: boolean;
    enableRealisticFees?: boolean;
  }
) {
  // Check bot exists
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) {
    throw new NotFoundError('Bot');
  }

  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + config.durationDays);

  // Create shadow session
  const [session] = await db
    .insert(shadowSessions)
    .values({
      userId,
      botId,
      virtualBalance: String(config.virtualBalance),
      currentBalance: String(config.virtualBalance),
      durationDays: config.durationDays,
      endsAt,
      status: 'running',
      enableRiskLimits: config.enableRiskLimits ?? true,
      enableRealisticFees: config.enableRealisticFees ?? true,
    })
    .returning();

  // Create or update subscription in shadow mode
  const [subscription] = await db
    .insert(botSubscriptions)
    .values({
      userId,
      botId,
      mode: 'paper',
      status: 'shadow',
    })
    .onConflictDoUpdate({
      target: [botSubscriptions.userId, botSubscriptions.botId],
      set: {
        mode: 'paper',
        status: 'shadow',
        updatedAt: new Date(),
      },
    })
    .returning();

  return { session, subscription };
}

export async function getShadowResults(userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(shadowSessions)
    .where(
      and(
        eq(shadowSessions.id, sessionId),
        eq(shadowSessions.userId, userId),
      ),
    );

  if (!session) {
    throw new NotFoundError('Shadow session');
  }

  // Get bot info
  const [bot] = session.botId
    ? await db.select().from(bots).where(eq(bots.id, session.botId))
    : [null];

  // Get trades for this session
  const sessionTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.shadowSessionId, sessionId));

  const initial = parseFloat(session.virtualBalance);
  const current = parseFloat(session.currentBalance ?? session.virtualBalance);
  const totalReturn = ((current - initial) / initial) * 100;
  const winRate = session.totalTrades && session.totalTrades > 0
    ? ((session.winCount ?? 0) / session.totalTrades) * 100
    : 0;

  return {
    session: {
      ...session,
      totalReturn: totalReturn.toFixed(2),
      winRate: winRate.toFixed(2),
    },
    bot: bot ? {
      id: bot.id,
      name: bot.name,
      strategy: bot.strategy,
      avatarLetter: bot.avatarLetter,
      avatarColor: bot.avatarColor,
    } : null,
    trades: sessionTrades,
    dailyPerformance: session.dailyPerformance ?? {},
  };
}

export async function getUserShadowSessions(userId: string) {
  const sessions = await db
    .select({
      session: shadowSessions,
      botName: bots.name,
      botStrategy: bots.strategy,
      botAvatarLetter: bots.avatarLetter,
      botAvatarColor: bots.avatarColor,
    })
    .from(shadowSessions)
    .leftJoin(bots, eq(shadowSessions.botId, bots.id))
    .where(eq(shadowSessions.userId, userId));

  return sessions.map(({ session, ...botInfo }) => {
    const initial = parseFloat(session.virtualBalance);
    const current = parseFloat(session.currentBalance ?? session.virtualBalance);
    const totalReturn = ((current - initial) / initial) * 100;

    return {
      ...session,
      totalReturn: totalReturn.toFixed(2),
      ...botInfo,
    };
  });
}

export async function getUserActiveBots(userId: string) {
  const rows = await db
    .select({
      subscriptionId: botSubscriptions.id,
      subscriptionStatus: botSubscriptions.status,
      subscriptionMode: botSubscriptions.mode,
      allocatedAmount: botSubscriptions.allocatedAmount,
      startedAt: botSubscriptions.startedAt,
      botId: bots.id,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botCategory: bots.category,
      botRiskLevel: bots.riskLevel,
      botAvatarColor: bots.avatarColor,
      botAvatarLetter: bots.avatarLetter,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
    })
    .from(botSubscriptions)
    .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(botSubscriptions.userId, userId));

  return rows;
}

export async function backtestBot(
  userId: string,
  botId: string,
  config: {
    startDate?: string;
    endDate?: string;
    initialBalance?: number;
  },
) {
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) throw new NotFoundError('Bot');

  const initial = config.initialBalance ?? 10_000;
  const [botStats] = await db
    .select()
    .from(botStatistics)
    .where(eq(botStatistics.botId, botId))
    .limit(1);

  // Generate realistic backtest based on bot stats
  const return30d = botStats?.return30d ? parseFloat(botStats.return30d) : (Math.random() * 15 - 3);
  const winRate = botStats?.winRate ? parseFloat(botStats.winRate) : (45 + Math.random() * 20);
  const maxDrawdown = botStats?.maxDrawdown ? parseFloat(botStats.maxDrawdown) : (5 + Math.random() * 15);
  const sharpeRatio = botStats?.sharpeRatio ? parseFloat(botStats.sharpeRatio) : (0.5 + Math.random() * 1.5);

  // Generate daily equity curve (30 days)
  const days = 30;
  const dailyReturn = return30d / days / 100;
  const equity: number[] = [initial];
  for (let i = 1; i <= days; i++) {
    const noise = (Math.random() - 0.5) * 0.02;
    const prev = equity[i - 1];
    equity.push(Math.round((prev * (1 + dailyReturn + noise)) * 100) / 100);
  }

  const totalTrades = Math.floor(20 + Math.random() * 80);
  const wins = Math.round(totalTrades * (winRate / 100));
  const finalBalance = equity[equity.length - 1];
  const totalProfit = finalBalance - initial;

  return {
    botId,
    botName: bot.name,
    strategy: bot.strategy,
    initialBalance: initial,
    finalBalance,
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalProfitPercent: Math.round((totalProfit / initial) * 10000) / 100,
    totalTrades,
    winCount: wins,
    lossCount: totalTrades - wins,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    equityCurve: equity,
    period: {
      start: config.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      end: config.endDate || new Date().toISOString().split('T')[0],
      days,
    },
  };
}

export async function addReview(
  userId: string,
  botId: string,
  rating: number,
  text: string
) {
  if (rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  // Check bot exists
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) {
    throw new NotFoundError('Bot');
  }

  // Insert review (unique constraint will prevent duplicates)
  const [review] = await db
    .insert(reviews)
    .values({
      userId,
      botId,
      rating,
      text,
    })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.botId],
      set: {
        rating,
        text,
        createdAt: new Date(),
      },
    })
    .returning();

  // Recalculate average rating and review count
  const [stats] = await db
    .select({
      avgRating: sql<string>`ROUND(AVG(${reviews.rating})::numeric, 2)`,
      reviewCount: sql<number>`COUNT(*)::int`,
    })
    .from(reviews)
    .where(eq(reviews.botId, botId));

  await db
    .update(botStatistics)
    .set({
      avgRating: stats.avgRating,
      reviewCount: stats.reviewCount,
      updatedAt: new Date(),
    })
    .where(eq(botStatistics.botId, botId));

  return review;
}

// ─── Paper Trading ──────────────────────────────────────────────────────────

export async function getPaperTradingStatus(userId: string) {
  // Get all running shadow sessions for this user
  const runningSessions = await db
    .select({
      id: shadowSessions.id,
      botId: shadowSessions.botId,
      virtualBalance: shadowSessions.virtualBalance,
      currentBalance: shadowSessions.currentBalance,
      durationDays: shadowSessions.durationDays,
      startedAt: shadowSessions.startedAt,
      endsAt: shadowSessions.endsAt,
      status: shadowSessions.status,
      totalTrades: shadowSessions.totalTrades,
      botName: bots.name,
      botStrategy: bots.strategy,
    })
    .from(shadowSessions)
    .leftJoin(bots, eq(shadowSessions.botId, bots.id))
    .where(
      and(
        eq(shadowSessions.userId, userId),
        eq(shadowSessions.status, 'running'),
      ),
    )
    .orderBy(desc(shadowSessions.startedAt));

  const totalVirtualBalance = runningSessions.reduce(
    (sum, s) => sum + parseFloat(s.currentBalance ?? s.virtualBalance),
    0,
  );

  const activePositions = runningSessions.length;

  return {
    virtualBalance: Math.round(totalVirtualBalance * 100) / 100,
    activePositions,
    sessions: runningSessions,
  };
}
