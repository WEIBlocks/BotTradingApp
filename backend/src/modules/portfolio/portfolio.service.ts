import { db } from '../../config/database.js';
import { exchangeConnections, exchangeAssets, portfolioSnapshots } from '../../db/schema/exchanges.js';
import { botPositions } from '../../db/schema/positions.js';
import { trades } from '../../db/schema/trades.js';
import { eq, and, sql, desc, gte, count } from 'drizzle-orm';

export async function getSummary(userId: string) {
  // Only count assets with amount > 0
  const [result] = await db
    .select({
      totalValue: sql<string>`COALESCE(SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.valueUsd}::numeric ELSE 0 END), 0)`,
      change24h: sql<string>`COALESCE(
        SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.valueUsd}::numeric * ${exchangeAssets.change24h}::numeric / 100 ELSE 0 END), 0
      )`,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(eq(exchangeConnections.userId, userId));

  const totalValue = parseFloat(result?.totalValue ?? '0');
  const change24hValue = parseFloat(result?.change24h ?? '0');
  const change24hPercent = totalValue > 0 ? (change24hValue / totalValue) * 100 : 0;

  // Get total realized P&L from closed positions
  const [pnlResult] = await db
    .select({
      totalPnl: sql<string>`COALESCE(SUM(${botPositions.pnl}::numeric), 0)`,
      totalTrades: count(),
    })
    .from(botPositions)
    .where(and(eq(botPositions.userId, userId), eq(botPositions.status, 'closed')));

  // Get open positions count
  const [openResult] = await db
    .select({ count: count() })
    .from(botPositions)
    .where(and(eq(botPositions.userId, userId), eq(botPositions.status, 'open')));

  return {
    totalValue: totalValue.toFixed(2),
    change24h: change24hValue.toFixed(2),
    change24hPercent: change24hPercent.toFixed(2),
    totalRealizedPnl: parseFloat(pnlResult?.totalPnl ?? '0').toFixed(2),
    closedPositions: pnlResult?.totalTrades ?? 0,
    openPositions: openResult?.count ?? 0,
  };
}

export async function getAssets(userId: string) {
  const rows = await db
    .select({
      id: exchangeAssets.id,
      symbol: exchangeAssets.symbol,
      name: exchangeAssets.name,
      amount: exchangeAssets.amount,
      valueUsd: exchangeAssets.valueUsd,
      change24h: exchangeAssets.change24h,
      allocation: exchangeAssets.allocation,
      iconColor: exchangeAssets.iconColor,
      provider: exchangeConnections.provider,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(
      and(
        eq(exchangeConnections.userId, userId),
        sql`${exchangeAssets.amount}::numeric > 0`, // Only show assets user actually holds
      ),
    );

  return rows;
}

export async function getEquityHistory(userId: string, days = 30) {
  // Read real snapshots from DB
  const snapshots = await db
    .select({
      date: portfolioSnapshots.date,
      totalValue: portfolioSnapshots.totalValue,
      change24h: portfolioSnapshots.change24h,
      changePercent: portfolioSnapshots.changePercent,
    })
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.userId, userId),
        gte(portfolioSnapshots.date, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(portfolioSnapshots.date);

  if (snapshots.length > 0) {
    // Real data available — return actual equity curve
    const equityData = snapshots.map(s => ({
      date: s.date,
      value: parseFloat(s.totalValue),
      change: parseFloat(s.change24h ?? '0'),
      changePercent: parseFloat(s.changePercent ?? '0'),
    }));

    // Append current live value as latest point
    const summary = await getSummary(userId);
    const currentValue = parseFloat(summary.totalValue);
    if (currentValue > 0) {
      equityData.push({
        date: new Date(),
        value: currentValue,
        change: parseFloat(summary.change24h),
        changePercent: parseFloat(summary.change24hPercent),
      });
    }

    return {
      equityData: equityData.map(d => d.value),
      dates: equityData.map(d => d.date),
      detailed: equityData,
      days,
      isRealData: true,
    };
  }

  // No snapshots yet — generate a minimal curve from current value
  // This only happens for new users who just connected their exchange
  const assets = await getAssets(userId);
  const totalNow = assets.reduce((s, a) => s + parseFloat(String(a.valueUsd)), 0);

  if (totalNow === 0) {
    return { equityData: [], dates: [], detailed: [], days, isRealData: false };
  }

  // Return just the current value as a single point
  // Snapshots will build up over the coming days
  return {
    equityData: [totalNow],
    dates: [new Date()],
    detailed: [{ date: new Date(), value: totalNow, change: 0, changePercent: 0 }],
    days,
    isRealData: false,
  };
}

export async function getAllocation(userId: string) {
  // Only include assets with amount > 0
  const rows = await db
    .select({
      symbol: exchangeAssets.symbol,
      name: exchangeAssets.name,
      totalValue: sql<string>`SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.valueUsd}::numeric ELSE 0 END)`,
      totalAmount: sql<string>`SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.amount}::numeric ELSE 0 END)`,
      iconColor: exchangeAssets.iconColor,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(eq(exchangeConnections.userId, userId))
    .groupBy(exchangeAssets.symbol, exchangeAssets.name, exchangeAssets.iconColor)
    .having(sql`SUM(${exchangeAssets.amount}::numeric) > 0`);

  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.totalValue ?? '0'), 0);

  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    amount: parseFloat(r.totalAmount ?? '0'),
    value: parseFloat(r.totalValue ?? '0').toFixed(2),
    percentage: grandTotal > 0
      ? ((parseFloat(r.totalValue ?? '0') / grandTotal) * 100).toFixed(2)
      : '0.00',
    iconColor: r.iconColor,
  }));
}

/**
 * Get total P&L breakdown by bot
 */
export async function getPnlByBot(userId: string) {
  const rows = await db.execute(sql`
    SELECT
      bp.bot_id,
      b.name as bot_name,
      bp.is_paper,
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE bp.pnl::numeric > 0) as wins,
      COUNT(*) FILTER (WHERE bp.pnl::numeric < 0) as losses,
      COALESCE(SUM(bp.pnl::numeric), 0) as total_pnl,
      COALESCE(AVG(bp.pnl_percent::numeric), 0) as avg_pnl_percent,
      MAX(bp.pnl::numeric) as best_trade,
      MIN(bp.pnl::numeric) as worst_trade
    FROM bot_positions bp
    JOIN bots b ON bp.bot_id = b.id
    WHERE bp.user_id = ${userId} AND bp.status = 'closed'
    GROUP BY bp.bot_id, b.name, bp.is_paper
    ORDER BY total_pnl DESC
  `);

  return rows as unknown as Record<string, unknown>[];
}
