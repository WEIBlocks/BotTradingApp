import { eq, and, desc, sql, count, sum, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { bots, botStatistics, botSubscriptions, shadowSessions, reviews } from '../../db/schema/bots.js';
import { userSubscriptions, subscriptionPlans } from '../../db/schema/subscriptions.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { payments } from '../../db/schema/payments.js';
import { trades } from '../../db/schema/trades.js';
import { notifications } from '../../db/schema/notifications.js';
import { sendNotification } from '../../lib/notify.js';
import { trainingUploads, activityLog } from '../../db/schema/training.js';
import { chatMessages } from '../../db/schema/chat.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginate, paginatedResponse, type PaginationParams } from '../../lib/pagination.js';

// ---- Users ----

export async function listUsers(page: number, limit: number, search?: string) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(users)
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

export async function getUser(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User');
  }

  // Omit password hash
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function updateUser(
  userId: string,
  data: { role?: string; isActive?: boolean; name?: string },
) {
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.name !== undefined) updates.name = data.name;

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new NotFoundError('User');
  }

  const { passwordHash, ...safeUser } = updated;
  return safeUser;
}

export async function deleteUser(userId: string) {
  const [updated] = await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new NotFoundError('User');
  }

  return { message: 'User deactivated' };
}

// ---- Bots ----

export async function listBots(page: number, limit: number, status?: string) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const conditions = [];
  if (status) {
    conditions.push(eq(bots.status, status as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(bots)
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      strategy: bots.strategy,
      category: bots.category,
      status: bots.status,
      isPublished: bots.isPublished,
      creatorId: bots.creatorId,
      createdAt: bots.createdAt,
      creatorName: users.name,
    })
    .from(bots)
    .leftJoin(users, eq(bots.creatorId, users.id))
    .where(whereClause)
    .orderBy(desc(bots.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

export async function approveBot(botId: string) {
  const [updated] = await db
    .update(bots)
    .set({ status: 'approved', isPublished: true, updatedAt: new Date() })
    .where(eq(bots.id, botId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Bot');
  }

  return updated;
}

export async function rejectBot(botId: string, reason?: string) {
  const [updated] = await db
    .update(bots)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(bots.id, botId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Bot');
  }

  return { ...updated, rejectionReason: reason };
}

export async function suspendBot(botId: string) {
  const [updated] = await db
    .update(bots)
    .set({ status: 'suspended', isPublished: false, updatedAt: new Date() })
    .where(eq(bots.id, botId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Bot');
  }

  return updated;
}

// ---- Subscriptions ----

export async function listSubscriptions(page: number, limit: number) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const [totalResult] = await db
    .select({ count: count() })
    .from(userSubscriptions);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: userSubscriptions.id,
      userId: userSubscriptions.userId,
      planId: userSubscriptions.planId,
      status: userSubscriptions.status,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      createdAt: userSubscriptions.createdAt,
      userName: users.name,
      userEmail: users.email,
      planName: subscriptionPlans.name,
      planPrice: subscriptionPlans.price,
    })
    .from(userSubscriptions)
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

// ---- Exchange Connections ----

export async function listExchangeConnections(page: number, limit: number) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const [totalResult] = await db
    .select({ count: count() })
    .from(exchangeConnections);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: exchangeConnections.id,
      provider: exchangeConnections.provider,
      method: exchangeConnections.method,
      status: exchangeConnections.status,
      totalBalance: exchangeConnections.totalBalance,
      lastSyncAt: exchangeConnections.lastSyncAt,
      createdAt: exchangeConnections.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(exchangeConnections)
    .innerJoin(users, eq(exchangeConnections.userId, users.id))
    .orderBy(desc(exchangeConnections.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

// ---- Analytics ----

export async function getRevenueAnalytics() {
  const [totalRevenue] = await db
    .select({
      total: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)`,
      count: count(),
    })
    .from(payments)
    .where(eq(payments.status, 'succeeded'));

  // Monthly breakdown
  const monthly = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
      coalesce(sum(amount::numeric), 0) as revenue,
      count(*) as transactions
    FROM payments
    WHERE status = 'succeeded'
      AND created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', created_at)
    ORDER BY month DESC
  `);

  return {
    totalRevenue: totalRevenue?.total ?? '0',
    totalTransactions: totalRevenue?.count ?? 0,
    monthly: monthly as unknown as Record<string, unknown>[],
  };
}

export async function getTradesAnalytics() {
  const [totals] = await db
    .select({
      totalTrades: count(),
      buyCount: sql<number>`count(*) filter (where ${trades.side} = 'BUY')`,
      sellCount: sql<number>`count(*) filter (where ${trades.side} = 'SELL')`,
      paperCount: sql<number>`count(*) filter (where ${trades.isPaper} = true)`,
      liveCount: sql<number>`count(*) filter (where ${trades.isPaper} = false)`,
    })
    .from(trades);

  return totals;
}

export async function getUsersAnalytics() {
  const [totals] = await db
    .select({
      totalUsers: count(),
      activeUsers: sql<number>`count(*) filter (where ${users.isActive} = true)`,
      adminCount: sql<number>`count(*) filter (where ${users.role} = 'admin')`,
      creatorCount: sql<number>`count(*) filter (where ${users.role} = 'creator')`,
    })
    .from(users);

  // New users this month
  const [newThisMonth] = await db
    .select({ count: count() })
    .from(users)
    .where(sql`${users.createdAt} >= date_trunc('month', now())`);

  return {
    ...totals,
    newThisMonth: newThisMonth?.count ?? 0,
  };
}

export async function getDashboardAnalytics() {
  const [revenue, tradeStats, userStats] = await Promise.all([
    getRevenueAnalytics(),
    getTradesAnalytics(),
    getUsersAnalytics(),
  ]);

  const [botCount] = await db
    .select({ count: count() })
    .from(bots);

  const [activeSubCount] = await db
    .select({ count: count() })
    .from(userSubscriptions)
    .where(eq(userSubscriptions.status, 'active'));

  return {
    revenue,
    trades: tradeStats,
    users: userStats,
    totalBots: botCount?.count ?? 0,
    activeSubscriptions: activeSubCount?.count ?? 0,
  };
}

// ---- Grant / Revoke Subscription ----

export async function grantSubscription(userId: string, planTier: string, durationDays: number) {
  // Find the plan by tier
  let [plan] = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.tier, planTier as any)).limit(1);

  if (!plan) {
    // Create a default pro plan if none exists
    [plan] = await db.insert(subscriptionPlans).values({
      name: planTier === 'pro' ? 'Pro' : 'Free',
      tier: planTier as any,
      price: planTier === 'pro' ? '4.94' : '0',
      period: 'monthly',
      features: planTier === 'pro' ? ['Trading Rooms', 'Live Feed', '3% Discount'] : [],
      isActive: true,
    }).returning();
  }

  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Check if user already has a subscription
  const [existing] = await db.select().from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId)).limit(1);

  if (existing) {
    // Update existing
    const [updated] = await db.update(userSubscriptions)
      .set({ status: 'active', currentPeriodStart: now, currentPeriodEnd: end, planId: plan.id, updatedAt: now })
      .where(eq(userSubscriptions.id, existing.id)).returning();
    return updated;
  } else {
    // Create new
    const [created] = await db.insert(userSubscriptions)
      .values({ userId, planId: plan.id, status: 'active', currentPeriodStart: now, currentPeriodEnd: end })
      .returning();
    return created;
  }
}

export async function revokeSubscription(userId: string) {
  const [updated] = await db.update(userSubscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(userSubscriptions.userId, userId)).returning();
  if (!updated) throw new NotFoundError('Subscription');
  return updated;
}

// ---- Settings ----

export async function getSettings() {
  return {
    maintenanceMode: false,
    registrationEnabled: true,
    maxBotsPerCreator: 10,
    defaultCommissionRate: 0.15,
    minWithdrawalAmount: 10,
    supportEmail: 'support@bottrade.app',
  };
}

export async function updateSettings(_data: Record<string, any>) {
  // Placeholder - settings would be stored in a settings table or config
  return { message: 'Settings updated' };
}

// ---- System Health ----

export async function getSystemHealth() {
  let dbStatus = 'healthy';
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = 'unhealthy';
  }

  let redisStatus = 'healthy';
  try {
    const { redisConnection } = await import('../../config/queue.js');
    await redisConnection.ping();
  } catch {
    redisStatus = 'unavailable';
  }

  const allHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    timestamp: new Date().toISOString(),
  };
}

// ---- Bot Reactivation ----

export async function reactivateBot(botId: string) {
  const [bot] = await db
    .update(bots)
    .set({ status: 'approved', isPublished: true, updatedAt: new Date() })
    .where(eq(bots.id, botId))
    .returning();

  if (!bot) {
    throw new NotFoundError('Bot');
  }

  return bot;
}

// ---- Bot Detail ----

export async function getBotDetail(botId: string) {
  const [bot] = await db
    .select({
      id: bots.id,
      creatorId: bots.creatorId,
      name: bots.name,
      subtitle: bots.subtitle,
      description: bots.description,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      creatorFeePercent: bots.creatorFeePercent,
      platformFeePercent: bots.platformFeePercent,
      tags: bots.tags,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      status: bots.status,
      isPublished: bots.isPublished,
      config: bots.config,
      version: bots.version,
      createdAt: bots.createdAt,
      updatedAt: bots.updatedAt,
      creatorName: users.name,
      creatorEmail: users.email,
    })
    .from(bots)
    .leftJoin(users, eq(bots.creatorId, users.id))
    .where(eq(bots.id, botId))
    .limit(1);

  if (!bot) {
    throw new NotFoundError('Bot');
  }

  const [stats] = await db
    .select()
    .from(botStatistics)
    .where(eq(botStatistics.botId, botId))
    .limit(1);

  const training = await db
    .select()
    .from(trainingUploads)
    .where(eq(trainingUploads.botId, botId))
    .orderBy(desc(trainingUploads.createdAt))
    .limit(20);

  const reviewList = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      botId: reviews.botId,
      rating: reviews.rating,
      text: reviews.text,
      createdAt: reviews.createdAt,
      userName: users.name,
    })
    .from(reviews)
    .leftJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.botId, botId))
    .orderBy(desc(reviews.createdAt))
    .limit(20);

  const [subCount] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(and(eq(botSubscriptions.botId, botId), eq(botSubscriptions.status, 'active')));

  return {
    ...bot,
    statistics: stats || null,
    training,
    reviews: reviewList,
    activeSubscriptions: subCount?.count ?? 0,
  };
}

// ---- User Detail ----

export async function getUserDetail(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User');
  }

  const activity = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt))
    .limit(20);

  const subs = await db
    .select({
      id: botSubscriptions.id,
      botId: botSubscriptions.botId,
      status: botSubscriptions.status,
      mode: botSubscriptions.mode,
      allocatedAmount: botSubscriptions.allocatedAmount,
      startedAt: botSubscriptions.startedAt,
      expiresAt: botSubscriptions.expiresAt,
      createdAt: botSubscriptions.createdAt,
      botName: bots.name,
    })
    .from(botSubscriptions)
    .leftJoin(bots, eq(botSubscriptions.botId, bots.id))
    .where(eq(botSubscriptions.userId, userId))
    .orderBy(desc(botSubscriptions.createdAt))
    .limit(20);

  const exchanges = await db
    .select({
      id: exchangeConnections.id,
      provider: exchangeConnections.provider,
      method: exchangeConnections.method,
      status: exchangeConnections.status,
      accountLabel: exchangeConnections.accountLabel,
      totalBalance: exchangeConnections.totalBalance,
      lastSyncAt: exchangeConnections.lastSyncAt,
      sandbox: exchangeConnections.sandbox,
      createdAt: exchangeConnections.createdAt,
    })
    .from(exchangeConnections)
    .where(eq(exchangeConnections.userId, userId));

  const [tradeCount] = await db
    .select({ count: count() })
    .from(trades)
    .where(eq(trades.userId, userId));

  const { passwordHash, ...safeUser } = user;

  return {
    ...safeUser,
    activity,
    botSubscriptions: subs,
    exchanges,
    tradeCount: tradeCount?.count ?? 0,
  };
}

// ---- Trades (global, filterable) ----

export async function listTrades(page: number, limit: number, userId?: string, botId?: string) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const conditions = [];
  if (userId) {
    conditions.push(eq(trades.userId, userId));
  }
  if (botId) {
    conditions.push(eq(botSubscriptions.botId, botId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = botId
    ? db.select({
        id: trades.id,
        userId: trades.userId,
        symbol: trades.symbol,
        side: trades.side,
        amount: trades.amount,
        price: trades.price,
        totalValue: trades.totalValue,
        pnl: trades.pnl,
        pnlPercent: trades.pnlPercent,
        isPaper: trades.isPaper,
        status: trades.status,
        executedAt: trades.executedAt,
        createdAt: trades.createdAt,
        userName: users.name,
      })
      .from(trades)
      .leftJoin(users, eq(trades.userId, users.id))
      .leftJoin(botSubscriptions, eq(trades.botSubscriptionId, botSubscriptions.id))
    : db.select({
        id: trades.id,
        userId: trades.userId,
        symbol: trades.symbol,
        side: trades.side,
        amount: trades.amount,
        price: trades.price,
        totalValue: trades.totalValue,
        pnl: trades.pnl,
        pnlPercent: trades.pnlPercent,
        isPaper: trades.isPaper,
        status: trades.status,
        executedAt: trades.executedAt,
        createdAt: trades.createdAt,
        userName: users.name,
      })
      .from(trades)
      .leftJoin(users, eq(trades.userId, users.id));

  // Count query
  const countBase = botId
    ? db.select({ count: count() }).from(trades)
        .leftJoin(botSubscriptions, eq(trades.botSubscriptionId, botSubscriptions.id))
    : db.select({ count: count() }).from(trades);

  const [totalResult] = await countBase.where(whereClause);
  const total = totalResult?.count ?? 0;

  const rows = await baseQuery
    .where(whereClause)
    .orderBy(desc(trades.executedAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

// ---- Chat History ----

export async function listChats(page: number, limit: number, userId?: string) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const conditions = [];
  if (userId) {
    conditions.push(eq(chatMessages.userId, userId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(chatMessages)
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      role: chatMessages.role,
      content: chatMessages.content,
      conversationId: chatMessages.conversationId,
      createdAt: chatMessages.createdAt,
      userName: users.name,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.userId, users.id))
    .where(whereClause)
    .orderBy(desc(chatMessages.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

// ---- Shadow Sessions ----

export async function listShadowSessions(page: number, limit: number) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const [totalResult] = await db
    .select({ count: count() })
    .from(shadowSessions);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: shadowSessions.id,
      userId: shadowSessions.userId,
      botId: shadowSessions.botId,
      virtualBalance: shadowSessions.virtualBalance,
      currentBalance: shadowSessions.currentBalance,
      durationDays: shadowSessions.durationDays,
      startedAt: shadowSessions.startedAt,
      endsAt: shadowSessions.endsAt,
      status: shadowSessions.status,
      totalTrades: shadowSessions.totalTrades,
      winCount: shadowSessions.winCount,
      createdAt: shadowSessions.createdAt,
      userName: users.name,
      botName: bots.name,
    })
    .from(shadowSessions)
    .leftJoin(users, eq(shadowSessions.userId, users.id))
    .leftJoin(bots, eq(shadowSessions.botId, bots.id))
    .orderBy(desc(shadowSessions.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

// ---- Delete Review ----

export async function deleteReview(reviewId: string) {
  const [deleted] = await db
    .delete(reviews)
    .where(eq(reviews.id, reviewId))
    .returning();

  if (!deleted) {
    throw new NotFoundError('Review');
  }

  return { message: 'Review deleted' };
}

// ---- Mass Notifications ----

export async function sendMassNotification(data: {
  target: 'all' | 'subscribers' | 'creators';
  title: string;
  body: string;
  priority?: 'low' | 'normal' | 'high';
}) {
  // Get target user IDs
  let targetUsers: { id: string }[];

  if (data.target === 'subscribers') {
    // Users with active subscriptions
    const subUsers = await db
      .select({ userId: userSubscriptions.userId })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.status, 'active'));
    const userIds = subUsers.map(s => s.userId);
    if (userIds.length === 0) return { sent: 0 };
    targetUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.id, userIds)));
  } else if (data.target === 'creators') {
    targetUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.role, 'creator')));
  } else {
    // all active users
    targetUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true));
  }

  if (targetUsers.length === 0) return { sent: 0 };

  // Send notifications with push (in batches to avoid overload)
  let sent = 0;
  const BATCH = 20;
  for (let i = 0; i < targetUsers.length; i += BATCH) {
    const batch = targetUsers.slice(i, i + BATCH);
    await Promise.all(batch.map(u =>
      sendNotification(u.id, {
        type: 'system',
        title: data.title,
        body: data.body,
        priority: data.priority || 'normal',
      }).catch(() => {})
    ));
    sent += batch.length;
  }

  return { sent };
}
