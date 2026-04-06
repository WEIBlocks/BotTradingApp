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
import { activityLog } from '../../db/schema/training.js';
import { botDecisions } from '../../db/schema/decisions.js';
import { botPositions } from '../../db/schema/positions.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { eq, and, sql, desc, asc, gte } from 'drizzle-orm';
import { NotFoundError, ConflictError, ValidationError, AppError } from '../../lib/errors.js';
import { invalidateRulesCache } from '../../lib/bot-engine.js';

async function logActivity(userId: string, type: 'purchase' | 'withdrawal' | 'profit' | 'deposit' | 'fee', title: string, subtitle: string, amount: string) {
  try {
    await db.insert(activityLog).values({ userId, type, title, subtitle, amount });
  } catch {
    // Non-critical — don't fail the parent operation
  }
}

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
  tradeDirection?: 'buy' | 'sell' | 'both';
  dailyLossLimit?: number;
  orderType?: 'market' | 'limit';
  creatorFeePercent?: number;
  prompt?: string;
  tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
  maxHoldsBeforeAI?: number;
  aiConfidenceThreshold?: number;
  aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
  customEntryConditions?: any[];
  customExitConditions?: any[];
  maxOpenPositions?: number;
  tradingSchedule?: string;
}

export async function createBot(userId: string, data: CreateBotData) {
  const config = {
    pairs: data.pairs ?? [],
    stopLoss: data.stopLoss,
    takeProfit: data.takeProfit,
    maxPositionSize: data.maxPositionSize,
    tradingMode: data.tradingMode,
    tradeDirection: data.tradeDirection ?? 'both',
    dailyLossLimit: data.dailyLossLimit ?? 0,
    orderType: data.orderType ?? 'market',
    tradingFrequency: data.tradingFrequency,
    maxHoldsBeforeAI: data.maxHoldsBeforeAI,
    aiConfidenceThreshold: data.aiConfidenceThreshold,
    aiMode: data.aiMode,
    customEntryConditions: data.customEntryConditions,
    customExitConditions: data.customExitConditions,
    maxOpenPositions: data.maxOpenPositions,
    tradingSchedule: data.tradingSchedule,
  };

  const [bot] = await db
    .insert(bots)
    .values({
      creatorId: userId,
      name: data.name,
      strategy: data.strategy,
      category: data.category as any,
      riskLevel: data.risk_level as any,
      creatorFeePercent: data.creatorFeePercent !== undefined ? String(data.creatorFeePercent) : '10',
      prompt: data.prompt,
      config,
      status: 'draft',
      isPublished: false,
    })
    .returning();

  // Create initial statistics row
  await db.insert(botStatistics).values({ botId: bot.id });

  // Auto-upgrade user role to 'creator' on first bot creation
  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (currentUser && currentUser.role === 'user') {
    await db
      .update(users)
      .set({ role: 'creator', updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return bot;
}

interface UpdateBotData {
  name?: string;
  strategy?: string;
  category?: string;
  risk_level?: string;
  pairs?: string[];
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  creatorFeePercent?: number;
  prompt?: string;
  tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
  maxHoldsBeforeAI?: number;
  aiConfidenceThreshold?: number;
  aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
  customEntryConditions?: any[];
  customExitConditions?: any[];
  maxOpenPositions?: number;
  tradingSchedule?: string;
}

export async function updateBot(userId: string, botId: string, data: UpdateBotData) {
  // Verify ownership
  const [existing] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.creatorId, userId)));

  if (!existing) {
    throw new NotFoundError('Bot');
  }

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.strategy !== undefined) updates.strategy = data.strategy;
  if (data.category !== undefined) updates.category = data.category;
  if (data.risk_level !== undefined) updates.riskLevel = data.risk_level;
  if (data.creatorFeePercent !== undefined) updates.creatorFeePercent = String(data.creatorFeePercent);
  if (data.prompt !== undefined) updates.prompt = data.prompt;

  // Merge config fields
  const existingConfig = (existing.config as Record<string, any>) ?? {};
  const configUpdates: Record<string, any> = { ...existingConfig };
  if (data.pairs !== undefined) configUpdates.pairs = data.pairs;
  if (data.stopLoss !== undefined) configUpdates.stopLoss = data.stopLoss;
  if (data.takeProfit !== undefined) configUpdates.takeProfit = data.takeProfit;
  if (data.maxPositionSize !== undefined) configUpdates.maxPositionSize = data.maxPositionSize;
  if (data.tradingFrequency !== undefined) configUpdates.tradingFrequency = data.tradingFrequency;
  if (data.maxHoldsBeforeAI !== undefined) configUpdates.maxHoldsBeforeAI = data.maxHoldsBeforeAI;
  if (data.aiConfidenceThreshold !== undefined) configUpdates.aiConfidenceThreshold = data.aiConfidenceThreshold;
  if (data.aiMode !== undefined) configUpdates.aiMode = data.aiMode;
  if (data.customEntryConditions !== undefined) configUpdates.customEntryConditions = data.customEntryConditions;
  if (data.customExitConditions !== undefined) configUpdates.customExitConditions = data.customExitConditions;
  if (data.maxOpenPositions !== undefined) configUpdates.maxOpenPositions = data.maxOpenPositions;
  if (data.tradingSchedule !== undefined) configUpdates.tradingSchedule = data.tradingSchedule;
  updates.config = configUpdates;

  const [updated] = await db
    .update(bots)
    .set(updates)
    .where(and(eq(bots.id, botId), eq(bots.creatorId, userId)))
    .returning();

  // Invalidate cached trading rules so AI regenerates them with new prompt/config
  invalidateRulesCache(botId);

  return updated;
}

export async function getBotForEdit(userId: string, botId: string) {
  const [bot] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.creatorId, userId)));

  if (!bot) {
    throw new NotFoundError('Bot');
  }

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

export async function purchaseBot(userId: string, botId: string, mode: 'live' | 'paper', requestedAmount?: number) {
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

  if (existing && existing.status === 'active') {
    throw new ConflictError('This bot is already active');
  }

  // For live mode: find exchange matching bot's asset class
  let exchangeConnId: string | null = null;
  let allocatedAmount = '0';
  if (mode === 'live') {
    // Determine required asset class from bot category
    const botCategory = (bot.category ?? 'Crypto').toLowerCase();
    const requiredAssetClass = botCategory === 'stocks' ? 'stocks' : 'crypto';

    // Find connected exchange matching the asset class
    const userExchanges = await db
      .select()
      .from(exchangeConnections)
      .where(
        and(
          eq(exchangeConnections.userId, userId),
          eq(exchangeConnections.status, 'connected'),
        ),
      );

    const matchingConn = userExchanges.find(c => (c.assetClass ?? 'crypto') === requiredAssetClass);

    if (!matchingConn) {
      const label = requiredAssetClass === 'stocks' ? 'stock (Alpaca)' : 'crypto';
      throw new AppError(400, `No connected ${label} exchange found. Please connect a ${label} exchange before going live with this bot.`);
    }

    const availableBalance = parseFloat(matchingConn.totalBalance ?? '0');

    // Mandatory balance check — applies to ALL users including admins.
    // An exchange must have funds before a bot can trade live.
    if (availableBalance <= 0) {
      const label = requiredAssetClass === 'stocks' ? 'stock (Alpaca)' : 'crypto';
      throw new AppError(400, `Your connected ${label} exchange has no available balance ($0). Please deposit funds before activating live trading.`);
    }

    // Validate requested amount against this exchange's balance.
    // requestedAmount must be > 0 and <= availableBalance.
    if (requestedAmount === undefined || requestedAmount <= 0) {
      throw new ValidationError(`Enter an amount to allocate for live trading (must be greater than $0).`);
    }
    if (requestedAmount > availableBalance) {
      throw new ValidationError(`Allocated amount ($${requestedAmount}) exceeds available ${requiredAssetClass} balance ($${availableBalance.toFixed(2)}).`);
    }
    allocatedAmount = String(requestedAmount);

    exchangeConnId = matchingConn.id;
  }

  const [subscription] = await db
    .insert(botSubscriptions)
    .values({
      userId,
      botId,
      mode,
      status: 'active',
      exchangeConnId,
      allocatedAmount,
    })
    .onConflictDoUpdate({
      target: [botSubscriptions.userId, botSubscriptions.botId],
      set: {
        mode,
        status: 'active',
        exchangeConnId,
        allocatedAmount,
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

  // Log activity
  await logActivity(userId, 'purchase', `Activated ${bot.name}`, `${mode} mode subscription`, allocatedAmount);

  return subscription;
}

export async function startShadowMode(
  userId: string,
  botId: string,
  config: {
    virtualBalance: number;
    durationDays?: number;
    durationMinutes?: number;
    enableRiskLimits?: boolean;
    enableRealisticFees?: boolean;
  }
) {
  // Check bot exists
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) {
    throw new NotFoundError('Bot');
  }

  // Prevent duplicate running shadow sessions for the same bot
  const [existingShadow] = await db
    .select()
    .from(shadowSessions)
    .where(
      and(
        eq(shadowSessions.userId, userId),
        eq(shadowSessions.botId, botId),
        eq(shadowSessions.status, 'running'),
      ),
    )
    .limit(1);

  if (existingShadow) {
    throw new ConflictError('A shadow session is already running for this bot');
  }

  // Calculate endsAt from either minutes or days
  const endsAt = new Date();
  const durationMinutes = config.durationMinutes ?? 0;
  const durationDays = config.durationDays ?? 0;

  if (durationMinutes > 0) {
    endsAt.setMinutes(endsAt.getMinutes() + durationMinutes);
  } else {
    endsAt.setDate(endsAt.getDate() + durationDays);
  }

  // Store durationDays — for minute-based durations store 1 as minimum display value
  const storedDays = durationDays > 0 ? durationDays : Math.max(1, Math.ceil(durationMinutes / 1440));

  // Create shadow session
  const [session] = await db
    .insert(shadowSessions)
    .values({
      userId,
      botId,
      virtualBalance: String(config.virtualBalance),
      currentBalance: String(config.virtualBalance),
      durationDays: storedDays,
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

  // Log activity
  const durationLabel = durationMinutes > 0 ? `${durationMinutes} min trial` : `${durationDays} day trial`;
  await logActivity(userId, 'purchase', `Shadow Mode Started`, `${bot.name} — ${durationLabel}`, String(config.virtualBalance));

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

  // Build daily performance from REAL data
  const rawDaily = session.dailyPerformance as Record<string, { trades: number; pnl: number; balance: number }> | null;
  let dailyPerfArray: number[] = [];
  if (rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)) {
    const sortedDays = Object.keys(rawDaily).sort();
    for (const day of sortedDays) {
      const dayData = rawDaily[day];
      if (dayData && typeof dayData === 'object' && 'pnl' in dayData) {
        const dayReturnPct = initial > 0 ? (dayData.pnl / initial) * 100 : 0;
        dailyPerfArray.push(Math.round(dayReturnPct * 100) / 100);
      }
    }
  }

  // Build equity curve from REAL daily balances
  const equityCurve: number[] = [initial];
  if (rawDaily && typeof rawDaily === 'object' && !Array.isArray(rawDaily)) {
    const sortedDays = Object.keys(rawDaily).sort();
    for (const day of sortedDays) {
      const dayData = rawDaily[day];
      if (dayData && 'balance' in dayData) {
        equityCurve.push(Math.round(dayData.balance * 100) / 100);
      }
    }
  }
  // Ensure current balance is the last point
  if (equityCurve[equityCurve.length - 1] !== current) {
    equityCurve.push(current);
  }

  // Get real closed positions for this session to calculate outperformance
  const sessionPositions = await db
    .select()
    .from(botPositions)
    .where(and(eq(botPositions.shadowSessionId, sessionId), eq(botPositions.status, 'closed')));

  const avgPositionReturn = sessionPositions.length > 0
    ? sessionPositions.reduce((sum, p) => sum + parseFloat(p.pnlPercent ?? '0'), 0) / sessionPositions.length
    : 0;

  // Outperformance = bot return vs simple buy-and-hold
  const outperformance = Math.round((totalReturn - avgPositionReturn * 0.5) * 10) / 10;

  return {
    session: {
      ...session,
      totalReturn: totalReturn.toFixed(2),
      winRate: winRate.toFixed(2),
      durationDays: session.durationDays,
    },
    bot: bot ? {
      id: bot.id,
      name: bot.name,
      strategy: bot.strategy,
      avatarLetter: bot.avatarLetter,
      avatarColor: bot.avatarColor,
    } : null,
    trades: sessionTrades,
    dailyPerformance: dailyPerfArray,
    equityCurve,
    outperformance,
    allocatedCapital: initial,
  };
}

export async function pauseShadowSession(userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(shadowSessions)
    .where(and(eq(shadowSessions.id, sessionId), eq(shadowSessions.userId, userId)));

  if (!session) throw new NotFoundError('Shadow session');
  if (session.status !== 'running') throw new ValidationError('Session is not running');

  const [updated] = await db
    .update(shadowSessions)
    .set({ status: 'paused' })
    .where(eq(shadowSessions.id, sessionId))
    .returning();

  await logActivity(userId, 'fee', 'Shadow Mode Paused', `Session paused`, '0.00');
  return updated;
}

export async function resumeShadowSession(userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(shadowSessions)
    .where(and(eq(shadowSessions.id, sessionId), eq(shadowSessions.userId, userId)));

  if (!session) throw new NotFoundError('Shadow session');
  if (session.status !== 'paused') throw new ValidationError('Session is not paused');

  const [updated] = await db
    .update(shadowSessions)
    .set({ status: 'running' })
    .where(eq(shadowSessions.id, sessionId))
    .returning();

  await logActivity(userId, 'profit', 'Shadow Mode Resumed', `Session resumed`, '0.00');
  return updated;
}

export async function stopShadowSession(userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(shadowSessions)
    .where(and(eq(shadowSessions.id, sessionId), eq(shadowSessions.userId, userId)));

  if (!session) throw new NotFoundError('Shadow session');
  if (session.status === 'completed' || session.status === 'cancelled') {
    throw new ValidationError('Session is already ended');
  }

  const [updated] = await db
    .update(shadowSessions)
    .set({ status: 'cancelled' })
    .where(eq(shadowSessions.id, sessionId))
    .returning();

  // Also update subscription status
  if (session.botId) {
    await db
      .update(botSubscriptions)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(and(eq(botSubscriptions.userId, userId), eq(botSubscriptions.botId, session.botId)));
  }

  await logActivity(userId, 'fee', 'Shadow Mode Stopped', `Session cancelled`, '0.00');
  return updated;
}

export async function getUserShadowSessions(userId: string) {
  const sessions = await db
    .select({
      session: shadowSessions,
      botName: bots.name,
      botStrategy: bots.strategy,
      botCategory: bots.category,
      botAvatarLetter: bots.avatarLetter,
      botAvatarColor: bots.avatarColor,
      botConfig: bots.config,
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

  // Get REAL closed positions for this bot
  const closedPositions = await db
    .select()
    .from(botPositions)
    .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')))
    .orderBy(botPositions.closedAt);

  // Get real stats from bot_statistics (calculated by bot-stats job)
  const [botStats] = await db
    .select()
    .from(botStatistics)
    .where(eq(botStatistics.botId, botId))
    .limit(1);

  const totalTrades = closedPositions.length;
  const wins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  // Build equity curve from REAL positions
  const equity: number[] = [initial];
  let running = initial;
  for (const p of closedPositions) {
    const pnl = parseFloat(p.pnl ?? '0');
    running += pnl;
    equity.push(Math.round(running * 100) / 100);
  }

  const finalBalance = equity[equity.length - 1];
  const totalProfit = finalBalance - initial;

  // Calculate max drawdown from real equity curve
  let peak = initial;
  let maxDrawdown = 0;
  for (const val of equity) {
    if (val > peak) peak = val;
    const dd = ((peak - val) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe from real stats or calculate
  const returns = closedPositions.map(p => parseFloat(p.pnlPercent ?? '0'));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length : 0;
  const sharpeRatio = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;

  return {
    botId,
    botName: bot.name,
    strategy: bot.strategy,
    initialBalance: initial,
    finalBalance,
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalProfitPercent: totalTrades > 0 ? Math.round((totalProfit / initial) * 10000) / 100 : 0,
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
      days: closedPositions.length > 0 ? Math.ceil((Date.now() - new Date(closedPositions[0].openedAt!).getTime()) / 86400000) : 0,
    },
    hasRealData: totalTrades > 0,
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

  // Check if user has an active subscription or completed shadow session (verified purchase)
  const [hasSub] = await db.select().from(botSubscriptions)
    .where(and(eq(botSubscriptions.userId, userId), eq(botSubscriptions.botId, botId))).limit(1);
  const [hasShadow] = await db.select().from(shadowSessions)
    .where(and(eq(shadowSessions.userId, userId), eq(shadowSessions.botId, botId))).limit(1);
  const isVerified = !!(hasSub || hasShadow);

  // Insert review (unique constraint will prevent duplicates)
  const [review] = await db
    .insert(reviews)
    .values({
      userId,
      botId,
      rating,
      text,
      isVerified,
    })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.botId],
      set: {
        rating,
        text,
        isVerified,
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

// ─── Live Mode Activation ───────────────────────────────────────────────────

export async function activateLiveMode(
  userId: string,
  botId: string,
  exchangeConnId: string,
  allocatedAmount?: number,
) {
  // Verify exchange connection exists and is connected
  const [conn] = await db
    .select()
    .from(exchangeConnections)
    .where(
      and(
        eq(exchangeConnections.id, exchangeConnId),
        eq(exchangeConnections.userId, userId),
        eq(exchangeConnections.status, 'connected'),
      ),
    )
    .limit(1);

  if (!conn) {
    throw new AppError(400, 'Exchange connection not found or not connected. Please connect your exchange first.');
  }

  // Mandatory balance check — applies to ALL users including admins
  const connBalance = parseFloat(conn.totalBalance ?? '0');
  if (connBalance <= 0) {
    throw new AppError(400, `Your connected ${conn.provider} exchange has no available balance ($0). Please deposit funds before activating live trading.`);
  }

  // Validate allocated amount
  if (allocatedAmount !== undefined) {
    if (allocatedAmount <= 0) {
      throw new ValidationError('Allocated amount must be greater than $0.');
    }
    if (allocatedAmount > connBalance) {
      throw new ValidationError(`Allocated amount ($${allocatedAmount}) exceeds available balance ($${connBalance.toFixed(2)}).`);
    }
  }

  // Check for existing subscription
  const [existingSub] = await db
    .select()
    .from(botSubscriptions)
    .where(
      and(
        eq(botSubscriptions.userId, userId),
        eq(botSubscriptions.botId, botId),
      ),
    )
    .limit(1);

  if (existingSub && existingSub.status === 'active' && existingSub.mode === 'live') {
    throw new ConflictError('Bot is already running in live mode');
  }

  // Update or create subscription
  if (existingSub) {
    const [updated] = await db
      .update(botSubscriptions)
      .set({
        status: 'active',
        mode: 'live',
        exchangeConnId,
        allocatedAmount: String(allocatedAmount ?? connBalance),
        updatedAt: new Date(),
      })
      .where(eq(botSubscriptions.id, existingSub.id))
      .returning();

    await logActivity(userId, 'purchase', 'Live Mode Activated', `Bot activated with ${conn.provider} exchange`, allocatedAmount?.toString() ?? String(connBalance));

    return updated;
  }

  // Create new subscription
  const [sub] = await db
    .insert(botSubscriptions)
    .values({
      userId,
      botId,
      status: 'active',
      mode: 'live',
      exchangeConnId,
      allocatedAmount: String(allocatedAmount ?? connBalance),
    })
    .returning();

  await logActivity(userId, 'purchase', 'Live Mode Activated', `Bot activated with ${conn.provider} exchange`, allocatedAmount?.toString() ?? '0');

  return sub;
}

// ─── Bot Decision History ───────────────────────────────────────────────────

export async function getBotDecisions(
  userId: string,
  botId: string,
  limit = 50,
  offset = 0,
  mode?: 'paper' | 'live',
) {
  const conditions = [
    eq(botDecisions.botId, botId),
    eq(botDecisions.userId, userId),
  ];
  if (mode) {
    conditions.push(eq(botDecisions.mode, mode));
  }
  const whereCondition = and(...conditions);

  // Get total count + action breakdown in one query
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalBuys: sql<number>`count(*) FILTER (WHERE ${botDecisions.action} = 'BUY')::int`,
      totalSells: sql<number>`count(*) FILTER (WHERE ${botDecisions.action} = 'SELL')::int`,
      totalHolds: sql<number>`count(*) FILTER (WHERE ${botDecisions.action} = 'HOLD')::int`,
      totalAiCalls: sql<number>`count(*) FILTER (WHERE ${botDecisions.aiCalled} = true)::int`,
      totalTokens: sql<number>`COALESCE(sum(${botDecisions.tokensCost}), 0)::int`,
    })
    .from(botDecisions)
    .where(whereCondition);

  const total = stats?.total ?? 0;

  const decisions = await db
    .select()
    .from(botDecisions)
    .where(whereCondition)
    .orderBy(desc(botDecisions.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);

  return {
    decisions,
    pagination: {
      total,
      limit: Math.min(limit, 100),
      offset,
      hasMore: offset + decisions.length < total,
    },
    stats: {
      totalBuys: stats?.totalBuys ?? 0,
      totalSells: stats?.totalSells ?? 0,
      totalHolds: stats?.totalHolds ?? 0,
      totalAiCalls: stats?.totalAiCalls ?? 0,
      totalTokens: stats?.totalTokens ?? 0,
    },
  };
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function getLeaderboard() {
  const rows = await db
    .select({
      botId: bots.id,
      botName: bots.name,
      strategy: bots.strategy,
      riskLevel: bots.riskLevel,
      avatarLetter: bots.avatarLetter,
      avatarColor: bots.avatarColor,
      creatorId: bots.creatorId,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.isPublished, true))
    .orderBy(desc(botStatistics.return30d))
    .limit(50);

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ─── Compare Bots ───────────────────────────────────────────────────────────

export async function compareBots(botIds: string[]) {
  if (botIds.length === 0) return [];
  if (botIds.length > 5) botIds = botIds.slice(0, 5);

  const results = [];
  for (const botId of botIds) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    const [stats] = await db.select().from(botStatistics).where(eq(botStatistics.botId, botId));
    const posCount = await db.select({ count: sql<number>`count(*)::int` }).from(botPositions)
      .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')));

    if (bot) {
      results.push({
        id: bot.id, name: bot.name, strategy: bot.strategy, riskLevel: bot.riskLevel,
        return30d: stats?.return30d ?? '0', winRate: stats?.winRate ?? '0',
        maxDrawdown: stats?.maxDrawdown ?? '0', sharpeRatio: stats?.sharpeRatio ?? '0',
        activeUsers: stats?.activeUsers ?? 0, avgRating: stats?.avgRating ?? '0',
        totalTrades: posCount[0]?.count ?? 0,
      });
    }
  }
  return results;
}

// ─── Copy Trading ───────────────────────────────────────────────────────────

export async function startCopyTrading(
  userId: string, botId: string, allocationPercent = 100, isPaper = true,
) {
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) throw new NotFoundError('Bot');

  const { copyTradingSessions } = await import('../../db/schema/copy-trading');

  const [session] = await db.insert(copyTradingSessions).values({
    followerId: userId,
    leaderId: bot.creatorId,
    botId,
    allocationPercent: String(allocationPercent),
    isPaper,
    status: 'active',
  }).onConflictDoUpdate({
    target: [copyTradingSessions.followerId, copyTradingSessions.botId],
    set: { status: 'active', allocationPercent: String(allocationPercent), isPaper },
  }).returning();

  await logActivity(userId, 'purchase', 'Copy Trading Started', `Copying ${bot.name}`, '0');
  return session;
}

export async function stopCopyTrading(userId: string, botId: string) {
  const { copyTradingSessions } = await import('../../db/schema/copy-trading');

  const [session] = await db.update(copyTradingSessions).set({
    status: 'stopped', stoppedAt: new Date(),
  }).where(
    and(
      eq(copyTradingSessions.followerId, userId),
      eq(copyTradingSessions.botId, botId),
    ),
  ).returning();

  if (!session) throw new NotFoundError('Copy trading session');
  return session;
}

export async function getBotEquityCurve(botId: string, days: number = 30) {
  // Query closed positions for this bot, ordered by closedAt
  const closedPositions = await db
    .select({
      pnl: botPositions.pnl,
      pnlPercent: botPositions.pnlPercent,
      closedAt: botPositions.closedAt,
      symbol: botPositions.symbol,
    })
    .from(botPositions)
    .where(
      and(
        eq(botPositions.botId, botId),
        eq(botPositions.status, 'closed'),
        gte(botPositions.closedAt, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(asc(botPositions.closedAt));

  // Build cumulative equity curve
  let cumPnl = 0;
  const equityData: number[] = [0]; // start at 0 (baseline)
  const dates: string[] = [new Date(Date.now() - days * 86400000).toISOString()];

  for (const pos of closedPositions) {
    cumPnl += parseFloat(pos.pnl ?? '0');
    equityData.push(Number(cumPnl.toFixed(2)));
    dates.push(pos.closedAt?.toISOString() ?? new Date().toISOString());
  }

  // Add current value as last point if no trades found
  if (equityData.length === 1) {
    equityData.push(0);
    dates.push(new Date().toISOString());
  }

  return { equityData, dates, totalPnl: cumPnl, tradeCount: closedPositions.length };
}

export async function getBotTradeMarkers(botId: string, symbol: string, days: number = 30) {
  // Get all decisions (BUY/SELL only) for this bot+symbol
  const markers = await db
    .select({
      action: botDecisions.action,
      price: botDecisions.price,
      confidence: botDecisions.confidence,
      reasoning: botDecisions.reasoning,
      timestamp: botDecisions.createdAt,
    })
    .from(botDecisions)
    .where(
      and(
        eq(botDecisions.botId, botId),
        eq(botDecisions.symbol, symbol),
        sql`${botDecisions.action} IN ('BUY', 'SELL')`,
        gte(botDecisions.createdAt, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(asc(botDecisions.createdAt));

  return markers.map(m => ({
    action: m.action,
    price: parseFloat(m.price ?? '0'),
    confidence: m.confidence,
    reasoning: m.reasoning,
    timestamp: m.timestamp?.getTime() ?? 0,
  }));
}

export async function updateUserConfig(userId: string, subscriptionId: string, data: Record<string, any>) {
  const [sub] = await db
    .select()
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.id, subscriptionId), eq(botSubscriptions.userId, userId)));

  if (!sub) throw new NotFoundError('Bot subscription');

  const existing = (sub.userConfig as Record<string, any>) ?? {};
  const merged = { ...existing, ...data };

  const [updated] = await db
    .update(botSubscriptions)
    .set({ userConfig: merged, updatedAt: new Date() })
    .where(eq(botSubscriptions.id, subscriptionId))
    .returning();

  return updated;
}

export async function getSubscription(userId: string, subscriptionId: string) {
  const [sub] = await db
    .select()
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.id, subscriptionId), eq(botSubscriptions.userId, userId)));

  if (!sub) throw new NotFoundError('Subscription');
  return sub;
}
