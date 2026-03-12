import { eq, and, desc, sql, count, sum, ilike, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { bots, botStatistics, botSubscriptions } from '../../db/schema/bots.js';
import { userSubscriptions, subscriptionPlans } from '../../db/schema/subscriptions.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { payments } from '../../db/schema/payments.js';
import { trades } from '../../db/schema/trades.js';
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
