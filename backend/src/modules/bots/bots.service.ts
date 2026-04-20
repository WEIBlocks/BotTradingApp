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
      strategy: data.strategy?.substring(0, 200),
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

export async function purchaseBot(userId: string, botId: string, mode: 'live' | 'paper', requestedAmount?: number, minOrderValue?: number) {
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

  // Validate and determine minOrderValue — must be >= $1 for stocks, >= $10 for crypto
  const assetClass = mode === 'live' ? (((await db.select().from(bots).where(eq(bots.id, botId)))[0]?.category ?? 'Crypto').toLowerCase() === 'stocks' ? 'stocks' : 'crypto') : 'crypto';
  const minFloor = assetClass === 'stocks' ? 1 : 10;
  if (minOrderValue !== undefined && minOrderValue < minFloor) {
    throw new ValidationError(`Minimum order value must be at least $${minFloor} for ${assetClass} trading.`);
  }
  const resolvedMinOrder = minOrderValue ?? minFloor;

  const [subscription] = await db
    .insert(botSubscriptions)
    .values({
      userId,
      botId,
      mode,
      status: 'active',
      exchangeConnId,
      allocatedAmount,
      minOrderValue: String(resolvedMinOrder),
    })
    .onConflictDoUpdate({
      target: [botSubscriptions.userId, botSubscriptions.botId],
      set: {
        mode,
        status: 'active',
        exchangeConnId,
        allocatedAmount,
        minOrderValue: String(resolvedMinOrder),
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
    minOrderValue?: number;
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

  // Validate minOrderValue — shadow mode uses virtual funds, min $1 per trade
  const resolvedMinOrder = config.minOrderValue && config.minOrderValue >= 1 ? config.minOrderValue : 10;

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
      minOrderValue: String(resolvedMinOrder),
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
      minOrderValue: botSubscriptions.minOrderValue,
      startedAt: botSubscriptions.startedAt,
      botId: bots.id,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botCategory: bots.category,
      botRiskLevel: bots.riskLevel,
      botAvatarColor: bots.avatarColor,
      botAvatarLetter: bots.avatarLetter,
      winRate: botStatistics.winRate,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
    })
    .from(botSubscriptions)
    .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(botSubscriptions.userId, userId));

  // Calculate per-user ROI from their actual closed positions (not global stats)
  const enriched = await Promise.all(rows.map(async (row) => {
    const allocAmount = parseFloat(row.allocatedAmount ?? '0');
    let return30d = 0;
    if (allocAmount > 0) {
      const [pnlResult]: any = await db.execute(sql`
        SELECT COALESCE(SUM(pnl::numeric), 0) as total_pnl
        FROM bot_positions
        WHERE bot_id = ${row.botId}
          AND user_id = ${userId}
          AND status = 'closed'
          AND is_paper = false
          AND closed_at >= now() - interval '30 days'
      `);
      const pnl30d = parseFloat(pnlResult?.total_pnl ?? '0');
      return30d = (pnl30d / allocAmount) * 100;
    }
    // Also get latest shadow session ROI for this bot (for portfolio/dashboard display)
    // Use virtualBalance + sum(closed position pnl) as the true return — avoids the
    // "low current_balance = open positions eating cash" false-negative bug.
    let shadowReturn30d: number | null = null;
    let hasShadow = false;
    const [latestShadow] = await db.execute(sql`
      SELECT id, virtual_balance, status, COALESCE(min_order_value, '10') as min_order_value
      FROM shadow_sessions
      WHERE user_id = ${userId} AND bot_id = ${row.botId}
      ORDER BY started_at DESC LIMIT 1
    `) as any[];
    if (latestShadow) {
      hasShadow = true;
      const vb = parseFloat(latestShadow.virtual_balance ?? '0');
      if (vb > 0) {
        const [pnlRow] = await db.execute(sql`
          SELECT COALESCE(SUM(pnl::numeric), 0) AS realized_pnl
          FROM bot_positions
          WHERE shadow_session_id = ${latestShadow.id}
            AND status = 'closed'
        `) as any[];
        const realizedPnl = parseFloat(pnlRow?.realized_pnl ?? '0');
        shadowReturn30d = (realizedPnl / vb) * 100;
      } else {
        shadowReturn30d = 0;
      }
    }

    const shadowMinOrderValue = latestShadow ? parseFloat(latestShadow.min_order_value ?? '10') : null;
    return { ...row, return30d, shadowReturn30d, hasShadow, shadowMinOrderValue };
  }));

  return enriched;
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

export async function getBotEquityCurve(botId: string, userId: string, days: number = 30) {
  // Get user's starting balance from their subscription (live) or shadow session (paper)
  let startingBalance = 0;
  const [sub] = await db.select({ amount: botSubscriptions.allocatedAmount })
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.botId, botId), eq(botSubscriptions.userId, userId), eq(botSubscriptions.status, 'active')))
    .limit(1);
  if (sub) {
    startingBalance = parseFloat(sub.amount ?? '0');
  } else {
    // Fallback: check shadow session
    const [session] = await db.select({ balance: shadowSessions.virtualBalance })
      .from(shadowSessions)
      .where(and(eq(shadowSessions.botId, botId), eq(shadowSessions.userId, userId), eq(shadowSessions.status, 'running')))
      .orderBy(desc(shadowSessions.startedAt))
      .limit(1);
    startingBalance = parseFloat(session?.balance ?? '0');
  }

  // Query closed positions for this specific user + bot, ordered by closedAt
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
        eq(botPositions.userId, userId),
        eq(botPositions.status, 'closed'),
        gte(botPositions.closedAt, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(asc(botPositions.closedAt));

  // Build cumulative equity curve starting from user's actual balance
  let cumPnl = 0;
  const equityData: number[] = [startingBalance]; // start at user's allocated balance
  const dates: string[] = [new Date(Date.now() - days * 86400000).toISOString()];

  for (const pos of closedPositions) {
    cumPnl += parseFloat(pos.pnl ?? '0');
    equityData.push(Number((startingBalance + cumPnl).toFixed(2)));
    dates.push(pos.closedAt?.toISOString() ?? new Date().toISOString());
  }

  // Add current value as last point
  if (equityData.length === 1) {
    equityData.push(startingBalance);
    dates.push(new Date().toISOString());
  }

  const totalReturn = startingBalance > 0 ? (cumPnl / startingBalance) * 100 : 0;
  return { equityData, dates, startingBalance, totalPnl: cumPnl, totalReturn, tradeCount: closedPositions.length };
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

// ─── Public Live Stats (all users, live mode only) ─────────────────────────

export async function getPublicLiveStats(botId: string) {
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
  if (!bot) throw new NotFoundError('Bot');

  // All positions (live only, including stopped subscriptions) for this bot
  const [posStats] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'closed')::int                            AS total_trades,
      COUNT(*) FILTER (WHERE status = 'closed' AND pnl::numeric > 0)::int       AS wins,
      COUNT(*) FILTER (WHERE status = 'open')::int                              AS open_positions,
      COALESCE(SUM(pnl::numeric) FILTER (WHERE status = 'closed'), 0)           AS total_pnl,
      COALESCE(AVG(pnl_percent::numeric) FILTER (WHERE status = 'closed'), 0)   AS avg_return,
      MAX(pnl_percent::numeric) FILTER (WHERE status = 'closed')                AS best_trade_pct,
      MIN(pnl_percent::numeric) FILTER (WHERE status = 'closed')                AS worst_trade_pct,
      COUNT(DISTINCT user_id)::int                                               AS live_traders
    FROM bot_positions
    WHERE bot_id = ${botId} AND is_paper = false
  `) as any;

  const total = posStats?.total_trades ?? 0;
  const wins = posStats?.wins ?? 0;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  // 30-day window stats
  const [pos30d] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'closed')::int                                AS trades_30d,
      COUNT(*) FILTER (WHERE status = 'closed' AND pnl::numeric > 0)::int           AS wins_30d,
      COALESCE(SUM(pnl::numeric) FILTER (WHERE status = 'closed'), 0)               AS pnl_30d,
      COALESCE(AVG(pnl_percent::numeric) FILTER (WHERE status = 'closed'), 0)       AS avg_return_30d
    FROM bot_positions
    WHERE bot_id = ${botId} AND is_paper = false AND opened_at >= now() - interval '30 days'
  `) as any;

  // Cumulative P&L equity curve — one point per closed trade, sorted by close time
  // This shows the bot's cumulative live P&L across ALL users over time
  const allClosed = await db.execute(sql`
    SELECT
      closed_at,
      pnl::numeric AS pnl
    FROM bot_positions
    WHERE bot_id = ${botId} AND is_paper = false AND status = 'closed' AND closed_at IS NOT NULL
    ORDER BY closed_at ASC
    LIMIT 200
  `) as any[];

  const toIso = (v: any): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(String(v).replace(' ', 'T').replace(/(\+\d{2})$/, '$1:00'));
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  let cumPnl = 0;
  const equityCurve: number[] = [0]; // baseline zero so chart always starts flat
  const equityDates: string[] = [''];
  for (const row of allClosed) {
    cumPnl += parseFloat(row.pnl ?? '0');
    equityCurve.push(Math.round(cumPnl * 100) / 100);
    equityDates.push(toIso(row.closed_at) ?? '');
  }

  // Recent live trades (last 20, across all users, most recent first)
  const recentRows = await db.execute(sql`
    SELECT
      id,
      symbol,
      side,
      entry_price::numeric  AS entry_price,
      exit_price::numeric   AS exit_price,
      amount::numeric        AS amount,
      pnl::numeric          AS pnl,
      pnl_percent::numeric  AS pnl_percent,
      opened_at,
      closed_at
    FROM bot_positions
    WHERE bot_id = ${botId} AND is_paper = false AND status = 'closed' AND closed_at IS NOT NULL
    ORDER BY closed_at DESC
    LIMIT 20
  `) as any[];

  const recentTrades = recentRows.map((r: any) => ({
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    entryPrice: parseFloat(r.entry_price ?? '0'),
    exitPrice: r.exit_price ? parseFloat(r.exit_price) : null,
    amount: parseFloat(r.amount ?? '0'),
    pnl: parseFloat(r.pnl ?? '0'),
    pnlPercent: parseFloat(r.pnl_percent ?? '0'),
    openedAt: toIso(r.opened_at),
    closedAt: toIso(r.closed_at),
  }));

  return {
    liveTraders: posStats?.live_traders ?? 0,
    totalTrades: total,
    winRate: Math.round(winRate * 10) / 10,
    totalPnl: parseFloat(posStats?.total_pnl ?? '0'),
    avgReturn: parseFloat(posStats?.avg_return ?? '0'),
    openPositions: posStats?.open_positions ?? 0,
    trades30d: pos30d?.trades_30d ?? 0,
    pnl30d: parseFloat(pos30d?.pnl_30d ?? '0'),
    avgReturn30d: parseFloat(pos30d?.avg_return_30d ?? '0'),
    bestTradePct: posStats?.best_trade_pct != null ? parseFloat(posStats.best_trade_pct) : null,
    worstTradePct: posStats?.worst_trade_pct != null ? parseFloat(posStats.worst_trade_pct) : null,
    equityCurve,
    equityDates,
    recentTrades,
  };
}

// ─── My Personal Live Stats (current user, live mode only) ────────────────

export async function getMyLiveStats(userId: string, botId: string) {
  // Get the user's live subscription (any status — include stopped so past stats remain)
  const [sub] = await db.select()
    .from(botSubscriptions)
    .where(and(
      eq(botSubscriptions.botId, botId),
      eq(botSubscriptions.userId, userId),
      eq(botSubscriptions.mode, 'live'),
    ))
    .orderBy(desc(botSubscriptions.createdAt))
    .limit(1);

  // All live positions for this user+bot (is_paper=false), oldest first for equity curve
  const positions = await db.select().from(botPositions)
    .where(and(
      eq(botPositions.botId, botId),
      eq(botPositions.userId, userId),
      eq(botPositions.isPaper, false),
    ))
    .orderBy(asc(botPositions.openedAt));

  const open = positions.filter(p => p.status === 'open');
  const closed = positions.filter(p => p.status === 'closed');

  // realizedPnl: sum of actual P&L from closed positions (exitValue - entryValue)
  const realizedPnl = closed.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
  const winsArr = closed.filter(p => parseFloat(p.pnl ?? '0') > 0);
  const lossesArr = closed.filter(p => parseFloat(p.pnl ?? '0') <= 0);
  const winRate = closed.length > 0 ? (winsArr.length / closed.length) * 100 : 0;
  const avgWin = winsArr.length > 0 ? winsArr.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / winsArr.length : 0;
  const avgLoss = lossesArr.length > 0 ? lossesArr.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / lossesArr.length : 0;

  const allocatedAmount = parseFloat(sub?.allocatedAmount ?? '0');
  // currentBalance = allocated + realized P&L (correct economic display)
  const currentBalance = allocatedAmount > 0 ? allocatedAmount + realizedPnl : realizedPnl;
  const totalReturn = allocatedAmount > 0 ? (realizedPnl / allocatedAmount) * 100 : 0;

  // Max drawdown: track equity curve using realizedPnl accumulation, relative to peak
  const startBalance = allocatedAmount > 0 ? allocatedAmount : 0;
  let peak = startBalance, maxDrawdown = 0, equityCumDD = startBalance;
  for (const p of closed) {
    equityCumDD += parseFloat(p.pnl ?? '0');
    if (equityCumDD > peak) peak = equityCumDD;
    const dd = peak > 0 ? ((peak - equityCumDD) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Equity curve: cumulative P&L from oldest to newest closed trade
  let equityCum = 0;
  const equityCurve: number[] = [0]; // starts at 0 profit
  const equityDates: string[] = [sub?.createdAt instanceof Date ? sub.createdAt.toISOString() : String(sub?.createdAt ?? '')];
  for (const p of closed) {
    equityCum += parseFloat(p.pnl ?? '0');
    equityCurve.push(Math.round(equityCum * 100) / 100);
    const dt = p.closedAt;
    equityDates.push(dt instanceof Date ? dt.toISOString() : String(dt ?? ''));
  }

  const bestTrade = closed.length > 0 ? closed.reduce((b, p) => parseFloat(p.pnlPercent ?? '0') > parseFloat(b.pnlPercent ?? '0') ? p : b) : null;
  const worstTrade = closed.length > 0 ? closed.reduce((w, p) => parseFloat(p.pnlPercent ?? '0') < parseFloat(w.pnlPercent ?? '0') ? p : w) : null;

  // Closed trades: show both sides (entry and exit info) — most recent first
  const closedTrades = [...closed].reverse().slice(0, 50).map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: 'buy/sell', // each position is a complete round trip
    entryPrice: parseFloat(p.entryPrice),
    exitPrice: p.exitPrice ? parseFloat(p.exitPrice) : null,
    amount: parseFloat(p.amount),
    pnl: parseFloat(p.pnl ?? '0'),
    pnlPercent: parseFloat(p.pnlPercent ?? '0'),
    openedAt: p.openedAt,
    closedAt: p.closedAt,
  }));

  const openPositions = open.map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    entryPrice: parseFloat(p.entryPrice),
    amount: parseFloat(p.amount),
    entryValue: parseFloat(p.entryValue ?? '0'),
    openedAt: p.openedAt,
  }));

  // Monthly returns from closed positions grouped by month
  const monthlyPnlMap: Record<string, number> = {};
  for (const p of closed) {
    const dt = p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt ?? Date.now());
    const month = dt.toISOString().substring(0, 7);
    monthlyPnlMap[month] = (monthlyPnlMap[month] ?? 0) + parseFloat(p.pnl ?? '0');
  }
  const monthlyReturns = Object.entries(monthlyPnlMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({
      month,
      returnPct: allocatedAmount > 0 ? Math.round((pnl / allocatedAmount) * 10000) / 100 : 0,
      pnl: Math.round(pnl * 100) / 100,
    }));

  const startedAt = sub?.createdAt ?? (closed[0]?.openedAt ?? null);

  return {
    subscriptionStatus: sub?.status ?? 'none',
    allocatedAmount,
    currentBalance: Math.round(currentBalance * 100) / 100,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalTrades: closed.length,
    openPositionsCount: open.length,
    winRate: Math.round(winRate * 10) / 10,
    wins: winsArr.length,
    losses: lossesArr.length,
    avgWinPercent: Math.round(avgWin * 100) / 100,
    avgLossPercent: Math.round(avgLoss * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnlPercent: parseFloat(bestTrade.pnlPercent ?? '0'), pnl: parseFloat(bestTrade.pnl ?? '0') } : null,
    worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnlPercent: parseFloat(worstTrade.pnlPercent ?? '0'), pnl: parseFloat(worstTrade.pnl ?? '0') } : null,
    equityCurve,
    equityDates,
    closedTrades,
    openPositions,
    monthlyReturns,
    startedAt,
  };
}

// ─── Shadow Session Stats (current user's session only) ────────────────────

export async function getShadowSessionLiveStats(userId: string, sessionId: string) {
  const [session] = await db.select().from(shadowSessions)
    .where(and(eq(shadowSessions.id, sessionId), eq(shadowSessions.userId, userId)));
  if (!session) throw new NotFoundError('Shadow session');

  // Positions scoped strictly to this sessionId, oldest first for equity curve
  const positions = await db.select().from(botPositions)
    .where(and(
      eq(botPositions.shadowSessionId, sessionId),
      eq(botPositions.userId, userId),
    ))
    .orderBy(asc(botPositions.openedAt));

  const open = positions.filter(p => p.status === 'open');
  const closed = positions.filter(p => p.status === 'closed');

  // realizedPnl: sum of actual P&L from closed positions (exitValue - entryValue, computed by closePosition in bot-engine)
  const realizedPnl = closed.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
  const wins = closed.filter(p => parseFloat(p.pnl ?? '0') > 0);
  const losses = closed.filter(p => parseFloat(p.pnl ?? '0') <= 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length : 0;

  const virtualBalance = parseFloat(session.virtualBalance);

  // Use virtualBalance + realizedPnl as the true current balance for display.
  // The DB currentBalance tracks the engine's "cash on hand" (deducts BUY cost, adds back SELL proceeds)
  // which makes it look like losses when positions are open. We show the economically correct value.
  const displayBalance = virtualBalance + realizedPnl;
  const totalReturn = virtualBalance > 0 ? (realizedPnl / virtualBalance) * 100 : 0;

  // Max drawdown: track equity curve from realizedPnl accumulation
  let peak = virtualBalance, maxDrawdown = 0, equityCum = virtualBalance;
  for (const p of closed) {
    equityCum += parseFloat(p.pnl ?? '0');
    if (equityCum > peak) peak = equityCum;
    const dd = peak > 0 ? ((peak - equityCum) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const bestTrade = closed.length > 0 ? closed.reduce((b, p) => parseFloat(p.pnlPercent ?? '0') > parseFloat(b.pnlPercent ?? '0') ? p : b) : null;
  const worstTrade = closed.length > 0 ? closed.reduce((w, p) => parseFloat(p.pnlPercent ?? '0') < parseFloat(w.pnlPercent ?? '0') ? p : w) : null;

  const now = new Date();
  const started = session.startedAt ? new Date(session.startedAt) : now;
  const daysRunning = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86_400_000));

  // Equity curve: cumulative P&L points from oldest to newest closed trade
  let cumPnl = 0;
  const equityCurve: number[] = [0]; // start at 0 (no profit at start)
  const equityDates: string[] = [session.startedAt instanceof Date ? session.startedAt.toISOString() : String(session.startedAt ?? '')];
  for (const p of closed) {
    cumPnl += parseFloat(p.pnl ?? '0');
    equityCurve.push(Math.round(cumPnl * 100) / 100);
    const dt = p.closedAt;
    equityDates.push(dt instanceof Date ? dt.toISOString() : String(dt ?? ''));
  }

  // Closed trades list (most recent first, last 50)
  const closedTrades = [...closed].reverse().slice(0, 50).map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    entryPrice: parseFloat(p.entryPrice),
    exitPrice: p.exitPrice ? parseFloat(p.exitPrice) : null,
    amount: parseFloat(p.amount),
    pnl: parseFloat(p.pnl ?? '0'),
    pnlPercent: parseFloat(p.pnlPercent ?? '0'),
    openedAt: p.openedAt,
    closedAt: p.closedAt,
  }));

  // Open positions
  const openPositions = open.map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    entryPrice: parseFloat(p.entryPrice),
    amount: parseFloat(p.amount),
    entryValue: parseFloat(p.entryValue ?? '0'),
    openedAt: p.openedAt,
  }));

  // Monthly returns from dailyPerformance stored on the session
  const dailyPerf = (session.dailyPerformance as Record<string, {trades: number; pnl: number; balance: number}>) ?? {};
  const monthlyReturns = buildMonthlyReturns(dailyPerf, virtualBalance);

  return {
    sessionId: session.id,
    status: session.status,
    virtualBalance,
    currentBalance: Math.round(displayBalance * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    totalTrades: closed.length,
    openPositionsCount: open.length,
    winRate: Math.round(winRate * 10) / 10,
    wins: wins.length,
    losses: losses.length,
    avgWinPercent: Math.round(avgWin * 100) / 100,
    avgLossPercent: Math.round(avgLoss * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnlPercent: parseFloat(bestTrade.pnlPercent ?? '0'), pnl: parseFloat(bestTrade.pnl ?? '0') } : null,
    worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnlPercent: parseFloat(worstTrade.pnlPercent ?? '0'), pnl: parseFloat(worstTrade.pnl ?? '0') } : null,
    daysRunning,
    endsAt: session.endsAt,
    startedAt: session.startedAt,
    durationDays: session.durationDays,
    equityCurve,
    equityDates,
    openPositions,
    closedTrades,
    monthlyReturns,
  };
}

// Helper: build monthly returns map from dailyPerformance
function buildMonthlyReturns(dailyPerf: Record<string, {trades: number; pnl: number; balance: number}>, startingBalance: number): {month: string; returnPct: number; pnl: number}[] {
  const monthlyPnl: Record<string, number> = {};
  for (const [day, data] of Object.entries(dailyPerf)) {
    const month = day.substring(0, 7); // 'YYYY-MM'
    monthlyPnl[month] = (monthlyPnl[month] ?? 0) + (data.pnl ?? 0);
  }
  return Object.entries(monthlyPnl)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({
      month,
      returnPct: startingBalance > 0 ? Math.round((pnl / startingBalance) * 10000) / 100 : 0,
      pnl: Math.round(pnl * 100) / 100,
    }));
}

// ─── Bot Feed Stats ────────────────────────────────────────────────────────

export async function getBotFeedStats(userId: string, botId: string, mode?: 'paper' | 'live') {
  // Determine paper mode based on mode parameter
  const isPaper = mode === 'paper';

  // Build position filter
  const posConditions = [
    eq(botPositions.botId, botId),
    eq(botPositions.userId, userId),
  ];
  // For shadow mode, only show paper positions; for live, only show live positions
  if (mode) {
    posConditions.push(eq(botPositions.isPaper, isPaper));
  }

  // Get all positions for this user+bot (filtered by mode)
  const positions = await db.select().from(botPositions)
    .where(and(...posConditions))
    .orderBy(desc(botPositions.openedAt));

  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status === 'closed');

  // Calculate P&L
  const realizedPnl = closedPositions.reduce((sum, p) => sum + parseFloat(p.pnl ?? '0'), 0);
  const wins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0);
  const losses = closedPositions.filter(p => parseFloat(p.pnl ?? '0') <= 0);
  const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length : 0;

  // Open positions with unrealized P&L (we'll need current prices)
  const openPosData = [];
  let unrealizedPnl = 0;
  let totalInTrade = 0;
  for (const pos of openPositions) {
    const entryPrice = parseFloat(pos.entryPrice);
    const entryValue = parseFloat(pos.entryValue ?? '0');
    totalInTrade += entryValue;
    // We don't have live price here, but we can compute from entry — the frontend will show this
    openPosData.push({
      id: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice,
      amount: parseFloat(pos.amount),
      entryValue,
      stopLoss: pos.stopLoss ? parseFloat(pos.stopLoss) : null,
      takeProfit: pos.takeProfit ? parseFloat(pos.takeProfit) : null,
      reasoning: pos.entryReasoning,
      openedAt: pos.openedAt,
    });
  }

  // Get starting balance
  // For shadow mode: from shadow_sessions virtual_balance
  // For live mode: from bot_subscriptions allocated_amount
  let startingBalance = 0;
  if (mode === 'paper') {
    const [session] = await db.select({ balance: shadowSessions.virtualBalance, current: shadowSessions.currentBalance })
      .from(shadowSessions)
      .where(and(eq(shadowSessions.botId, botId), eq(shadowSessions.userId, userId), eq(shadowSessions.status, 'running')))
      .orderBy(desc(shadowSessions.startedAt))
      .limit(1);
    startingBalance = parseFloat(session?.balance ?? '10000');
    // Use current balance if available
    const currentBal = parseFloat(session?.current ?? '0');
    if (currentBal > 0) startingBalance = parseFloat(session?.balance ?? '10000');
  } else {
    const [sub] = await db.select({ amount: botSubscriptions.allocatedAmount })
      .from(botSubscriptions)
      .where(and(eq(botSubscriptions.botId, botId), eq(botSubscriptions.userId, userId), eq(botSubscriptions.status, 'active')))
      .limit(1);
    startingBalance = parseFloat(sub?.amount ?? '0');
  }

  const currentBalance = startingBalance + realizedPnl;
  const totalReturn = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance) * 100 : 0;

  // Need positions in chronological order for drawdown and equity curve
  const closedChron = [...closedPositions].sort((a, b) =>
    new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime()
  );

  // Max drawdown: equity-curve based, relative to peak
  let peak2 = startingBalance > 0 ? startingBalance : 0;
  let maxDrawdown = 0;
  let equityRunner = startingBalance > 0 ? startingBalance : 0;
  for (const p of closedChron) {
    equityRunner += parseFloat(p.pnl ?? '0');
    if (equityRunner > peak2) peak2 = equityRunner;
    const dd = peak2 > 0 ? ((peak2 - equityRunner) / peak2) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Equity curve (cumulative realized P&L)
  let ecCum = 0;
  const equityCurveData: number[] = [0];
  const equityDatesData: string[] = [];
  for (const p of closedChron) {
    ecCum += parseFloat(p.pnl ?? '0');
    equityCurveData.push(Math.round(ecCum * 100) / 100);
    const dt = p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt ?? Date.now());
    equityDatesData.push(dt.toISOString());
  }

  // Closed trades list (most recent first, limit 50) — each represents a complete round trip
  const closedTrades = closedPositions.slice(0, 50).map(p => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    entryPrice: parseFloat(p.entryPrice),
    exitPrice: p.exitPrice ? parseFloat(p.exitPrice) : null,
    amount: parseFloat(p.amount),
    entryValue: parseFloat(p.entryValue ?? '0'),
    exitValue: p.exitValue ? parseFloat(p.exitValue) : null,
    pnl: parseFloat(p.pnl ?? '0'),
    pnlPercent: parseFloat(p.pnlPercent ?? '0'),
    entryReasoning: p.entryReasoning,
    exitReasoning: p.exitReasoning,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
  }));

  // Best and worst trade
  const bestTrade = closedPositions.length > 0 ? closedPositions.reduce((best, p) => parseFloat(p.pnlPercent ?? '0') > parseFloat(best.pnlPercent ?? '0') ? p : best) : null;
  const worstTrade = closedPositions.length > 0 ? closedPositions.reduce((worst, p) => parseFloat(p.pnlPercent ?? '0') < parseFloat(worst.pnlPercent ?? '0') ? p : worst) : null;

  // Monthly returns from closed positions
  const monthlyPnlMap: Record<string, number> = {};
  for (const p of closedPositions) {
    const dt = p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt ?? Date.now());
    const month = dt.toISOString().substring(0, 7);
    monthlyPnlMap[month] = (monthlyPnlMap[month] ?? 0) + parseFloat(p.pnl ?? '0');
  }
  const monthlyReturns = Object.entries(monthlyPnlMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({
      month,
      returnPct: startingBalance > 0 ? Math.round((pnl / startingBalance) * 10000) / 100 : 0,
      pnl: Math.round(pnl * 100) / 100,
    }));

  return {
    startingBalance,
    currentBalance: Math.round(currentBalance * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    unrealizedPnl,
    totalInTrade,
    availableBalance: currentBalance - totalInTrade,
    totalTrades: closedPositions.length,
    winRate: Math.round(winRate * 10) / 10,
    wins: wins.length,
    losses: losses.length,
    avgWinPercent: Math.round(avgWin * 100) / 100,
    avgLossPercent: Math.round(avgLoss * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnlPercent: parseFloat(bestTrade.pnlPercent ?? '0'), pnl: parseFloat(bestTrade.pnl ?? '0') } : null,
    worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnlPercent: parseFloat(worstTrade.pnlPercent ?? '0'), pnl: parseFloat(worstTrade.pnl ?? '0') } : null,
    openPositions: openPosData,
    closedTrades,
    equityCurve: equityCurveData,
    equityDates: equityDatesData,
    monthlyReturns,
  };
}
