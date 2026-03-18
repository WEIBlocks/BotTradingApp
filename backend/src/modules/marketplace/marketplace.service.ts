import { db } from '../../config/database.js';
import { bots, botStatistics, reviews as reviewsTable, botSubscriptions } from '../../db/schema/bots.js';
import { trades } from '../../db/schema/trades.js';
import { users } from '../../db/schema/users.js';
import { eq, and, desc, asc, sql, ilike, count, inArray } from 'drizzle-orm';
import { NotFoundError } from '../../lib/errors.js';
import { paginate, paginatedResponse, type PaginationParams } from '../../lib/pagination.js';

interface ListBotsFilters {
  category?: string;
  risk_level?: string;
  search?: string;
  sort?: string;
  page: number;
  limit: number;
}

export async function listBots(filters: ListBotsFilters) {
  const { page, limit } = filters;
  const paginationParams: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(paginationParams);

  const conditions = [eq(bots.isPublished, true)];

  if (filters.category) {
    conditions.push(eq(bots.category, filters.category as any));
  }
  if (filters.risk_level) {
    conditions.push(eq(bots.riskLevel, filters.risk_level as any));
  }
  if (filters.search) {
    conditions.push(ilike(bots.name, `%${filters.search}%`));
  }

  const whereClause = and(...conditions);

  // Determine sort
  let orderBy;
  switch (filters.sort) {
    case 'return_30d':
      orderBy = desc(botStatistics.return30d);
      break;
    case 'active_users':
      orderBy = desc(botStatistics.activeUsers);
      break;
    case 'avg_rating':
      orderBy = desc(botStatistics.avgRating);
      break;
    default:
      orderBy = desc(bots.createdAt);
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      description: bots.description,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      tags: bots.tags,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      status: bots.status,
      version: bots.version,
      createdAt: bots.createdAt,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      activeUsers: botStatistics.activeUsers,
      reviewCount: botStatistics.reviewCount,
      avgRating: botStatistics.avgRating,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, paginationParams);
}

export async function getFeaturedBot() {
  const [row] = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      description: bots.description,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      tags: bots.tags,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      version: bots.version,
      createdAt: bots.createdAt,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      activeUsers: botStatistics.activeUsers,
      reviewCount: botStatistics.reviewCount,
      avgRating: botStatistics.avgRating,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.isPublished, true))
    .orderBy(desc(botStatistics.avgRating))
    .limit(1);

  return row ?? null;
}

export async function getTrendingBots(limit = 5) {
  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      tags: bots.tags,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.isPublished, true))
    .orderBy(desc(botStatistics.return30d))
    .limit(limit);

  return rows;
}

export async function getBotById(botId: string) {
  const [row] = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      description: bots.description,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      tags: bots.tags,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      status: bots.status,
      config: bots.config,
      version: bots.version,
      createdAt: bots.createdAt,
      updatedAt: bots.updatedAt,
      creatorId: bots.creatorId,
      creatorName: users.name,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      activeUsers: botStatistics.activeUsers,
      reviewCount: botStatistics.reviewCount,
      avgRating: botStatistics.avgRating,
      monthlyReturns: botStatistics.monthlyReturns,
      equityData: botStatistics.equityData,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .leftJoin(users, eq(bots.creatorId, users.id))
    .where(eq(bots.id, botId));

  if (!row) {
    throw new NotFoundError('Bot');
  }

  // Fetch reviews for this bot
  const botReviews = await db
    .select({
      id: reviewsTable.id,
      rating: reviewsTable.rating,
      text: reviewsTable.text,
      createdAt: reviewsTable.createdAt,
      userName: users.name,
    })
    .from(reviewsTable)
    .leftJoin(users, eq(reviewsTable.userId, users.id))
    .where(eq(reviewsTable.botId, botId))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(10);

  const formattedReviews = botReviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text ?? '',
    userName: r.userName ?? 'Anonymous',
    userInitials: (r.userName ?? 'A').split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase(),
    date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
  }));

  // Fetch recent trades related to this bot (via subscriptions)
  const subIds = await db
    .select({ id: botSubscriptions.id })
    .from(botSubscriptions)
    .where(eq(botSubscriptions.botId, botId))
    .limit(50);

  let recentTrades: any[] = [];
  if (subIds.length > 0) {
    const subIdList = subIds.map((s) => s.id);
    recentTrades = await db
      .select({
        id: trades.id,
        symbol: trades.symbol,
        side: trades.side,
        amount: trades.amount,
        price: trades.price,
        status: trades.status,
        executedAt: trades.executedAt,
      })
      .from(trades)
      .where(inArray(trades.botSubscriptionId, subIdList))
      .orderBy(desc(trades.executedAt))
      .limit(5);
  }

  const formattedTrades = recentTrades.map((t) => ({
    id: t.id,
    symbol: t.symbol ?? 'BTC/USDT',
    side: t.side ?? 'BUY',
    amount: parseFloat(t.amount ?? '0'),
    price: parseFloat(t.price ?? '0'),
    botName: row.name,
    timestamp: t.executedAt ?? new Date(),
  }));

  return {
    ...row,
    reviews: formattedReviews,
    recentTrades: formattedTrades,
  };
}
