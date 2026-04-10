import { db } from '../../config/database.js';
import { bots, botStatistics, reviews as reviewsTable, botSubscriptions } from '../../db/schema/bots.js';
import { botPositions } from '../../db/schema/positions.js';
import { trades } from '../../db/schema/trades.js';
import { users } from '../../db/schema/users.js';
import { eq, and, or, desc, asc, sql, ilike, count, inArray } from 'drizzle-orm';
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
    conditions.push(
      or(
        ilike(bots.name, `%${filters.search}%`),
        ilike(bots.strategy, `%${filters.search}%`),
      )!,
    );
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

export async function getBotById(botId: string, userId?: string) {
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
      .where(
        and(
          inArray(trades.botSubscriptionId, subIdList),
          eq(trades.isPaper, false),   // never expose shadow/paper trades to other users
          eq(trades.status, 'filled'), // only show successful trades
        ),
      )
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

  // Aggregate stats from LIVE positions only (exclude shadow/paper from public view)
  const positionStats: any = await db.execute(sql`
    SELECT
      count(*)::int as total_positions,
      count(*) FILTER (WHERE status = 'open')::int as open_positions,
      count(*) FILTER (WHERE status = 'closed')::int as closed_positions,
      count(*) FILTER (WHERE status = 'closed' AND pnl::numeric > 0)::int as winning_positions,
      COALESCE(sum(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as total_pnl,
      COALESCE(avg(pnl_percent::numeric) FILTER (WHERE status = 'closed'), 0) as avg_pnl_percent,
      count(DISTINCT user_id)::int as total_users
    FROM bot_positions WHERE bot_id = ${botId} AND is_paper = false
  `);
  const ps = (positionStats as any[])?.[0] || {};

  // Get total LIVE trade count across all users (exclude shadow decisions)
  const tradeStats: any = await db.execute(sql`
    SELECT count(*)::int as total_trades
    FROM bot_decisions WHERE bot_id = ${botId} AND action != 'HOLD' AND mode = 'live'
  `);
  const ts = (tradeStats as any[])?.[0] || {};

  // Get subscriber list count
  const subscriberCount: any = await db.execute(sql`
    SELECT
      count(*)::int as total_subscribers,
      count(*) FILTER (WHERE status = 'active')::int as active_subscribers,
      count(*) FILTER (WHERE mode = 'live')::int as live_subscribers
    FROM bot_subscriptions WHERE bot_id = ${botId}
  `);
  const sc = (subscriberCount as any[])?.[0] || {};

  // Per-user ROI: if the requesting user is subscribed, override return30d with their personal performance
  let userReturn30d = row.return30d;
  if (userId) {
    const [sub] = await db.select({ amount: botSubscriptions.allocatedAmount })
      .from(botSubscriptions)
      .where(and(eq(botSubscriptions.botId, botId), eq(botSubscriptions.userId, userId), eq(botSubscriptions.status, 'active')))
      .limit(1);
    if (sub) {
      const allocAmount = parseFloat(sub.amount ?? '0');
      if (allocAmount > 0) {
        const [pnlResult]: any = await db.execute(sql`
          SELECT COALESCE(SUM(pnl::numeric), 0) as total_pnl
          FROM bot_positions
          WHERE bot_id = ${botId}
            AND user_id = ${userId}
            AND status = 'closed'
            AND is_paper = false
            AND closed_at >= now() - interval '30 days'
        `);
        const pnl30d = parseFloat(pnlResult?.total_pnl ?? '0');
        userReturn30d = ((pnl30d / allocAmount) * 100).toFixed(2) as any;
      }
    }
  }

  return {
    ...row,
    return30d: userReturn30d,
    reviews: formattedReviews,
    recentTrades: formattedTrades,
    // Real-time aggregate stats
    aggregateStats: {
      totalUsers: Number(ps.total_users ?? 0),
      totalPositions: Number(ps.total_positions ?? 0),
      openPositions: Number(ps.open_positions ?? 0),
      closedPositions: Number(ps.closed_positions ?? 0),
      winningPositions: Number(ps.winning_positions ?? 0),
      totalPnl: Number(parseFloat(ps.total_pnl ?? 0).toFixed(2)),
      avgPnlPercent: Number(parseFloat(ps.avg_pnl_percent ?? 0).toFixed(2)),
      totalTrades: Number(ts.total_trades ?? 0),
      totalSubscribers: Number(sc.total_subscribers ?? 0),
      activeSubscribers: Number(sc.active_subscribers ?? 0),
      liveSubscribers: Number(sc.live_subscribers ?? 0),
    },
  };
}
