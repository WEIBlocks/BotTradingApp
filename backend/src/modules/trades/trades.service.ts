import { db } from '../../config/database.js';
import { trades } from '../../db/schema/trades.js';
import { bots, botSubscriptions } from '../../db/schema/bots.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { paginate, paginatedResponse, type PaginationParams } from '../../lib/pagination.js';

export async function getRecentTrades(userId: string, limit = 10) {
  const rows = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      side: trades.side,
      amount: trades.amount,
      price: trades.price,
      totalValue: trades.totalValue,
      pnl: trades.pnl,
      pnlPercent: trades.pnlPercent,
      isPaper: trades.isPaper,
      reasoning: trades.reasoning,
      status: trades.status,
      executedAt: trades.executedAt,
      botName: bots.name,
      botAvatarColor: bots.avatarColor,
      botAvatarLetter: bots.avatarLetter,
    })
    .from(trades)
    .leftJoin(botSubscriptions, eq(trades.botSubscriptionId, botSubscriptions.id))
    .leftJoin(bots, eq(botSubscriptions.botId, bots.id))
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.executedAt))
    .limit(limit);

  return rows;
}

interface TradeHistoryFilters {
  symbol?: string;
  side?: string;
  is_paper?: string;
  botId?: string;
  page: number;
  limit: number;
}

export async function getTradeHistory(userId: string, filters: TradeHistoryFilters) {
  const { page, limit } = filters;
  const paginationParams: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(paginationParams);

  const conditions: any[] = [eq(trades.userId, userId)];

  if (filters.symbol) {
    conditions.push(eq(trades.symbol, filters.symbol));
  }
  if (filters.side) {
    conditions.push(eq(trades.side, filters.side as any));
  }
  if (filters.is_paper !== undefined) {
    conditions.push(eq(trades.isPaper, filters.is_paper === 'true'));
  }
  if (filters.botId) {
    conditions.push(eq(botSubscriptions.botId, filters.botId));
  }

  const whereClause = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(trades)
    .leftJoin(botSubscriptions, eq(trades.botSubscriptionId, botSubscriptions.id))
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      side: trades.side,
      amount: trades.amount,
      price: trades.price,
      totalValue: trades.totalValue,
      pnl: trades.pnl,
      pnlPercent: trades.pnlPercent,
      isPaper: trades.isPaper,
      reasoning: trades.reasoning,
      status: trades.status,
      executedAt: trades.executedAt,
      botName: bots.name,
      botAvatarColor: bots.avatarColor,
      botAvatarLetter: bots.avatarLetter,
    })
    .from(trades)
    .leftJoin(botSubscriptions, eq(trades.botSubscriptionId, botSubscriptions.id))
    .leftJoin(bots, eq(botSubscriptions.botId, bots.id))
    .where(whereClause)
    .orderBy(desc(trades.executedAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, paginationParams);
}
