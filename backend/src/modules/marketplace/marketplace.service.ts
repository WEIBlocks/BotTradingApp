import { db } from '../../config/database.js';
import { bots, botStatistics } from '../../db/schema/bots.js';
import { users } from '../../db/schema/users.js';
import { eq, and, desc, asc, sql, ilike, count } from 'drizzle-orm';
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

  return row;
}
