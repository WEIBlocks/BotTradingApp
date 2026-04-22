import { db } from '../../config/database.js';
import { exchangeConnections, exchangeAssets, portfolioSnapshots } from '../../db/schema/exchanges.js';
import { botPositions } from '../../db/schema/positions.js';
import { trades } from '../../db/schema/trades.js';
import { eq, and, sql, desc, gte, count } from 'drizzle-orm';

/** Resolves which sandbox mode to query. Auto-detects if not specified. */
async function resolveSandbox(userId: string, mode?: 'live' | 'testnet'): Promise<boolean | null> {
  if (mode === 'live') return false;
  if (mode === 'testnet') return true;

  // Auto: prefer live if connected, else fall back to testnet
  const conns = await db
    .select({ sandbox: exchangeConnections.sandbox })
    .from(exchangeConnections)
    .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')));

  const hasLive     = conns.some(c => c.sandbox === false);
  const hasTestnet  = conns.some(c => c.sandbox === true);
  if (hasLive) return false;
  if (hasTestnet) return true;
  return null; // nothing connected
}

/** Returns which modes (live / testnet) the user has connected exchanges for. */
export async function getConnectedModes(userId: string) {
  const conns = await db
    .select({ sandbox: exchangeConnections.sandbox, provider: exchangeConnections.provider })
    .from(exchangeConnections)
    .where(and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.status, 'connected')));

  return {
    hasLive:    conns.some(c => c.sandbox === false),
    hasTestnet: conns.some(c => c.sandbox === true),
  };
}

export async function getSummary(userId: string, mode?: 'live' | 'testnet') {
  const sandbox = await resolveSandbox(userId, mode);

  // Only count assets with amount > 0
  const whereClause = sandbox === null
    ? and(eq(exchangeConnections.userId, userId))
    : and(eq(exchangeConnections.userId, userId), eq(exchangeConnections.sandbox, sandbox));

  const [result] = await db
    .select({
      totalValue: sql<string>`COALESCE(SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.valueUsd}::numeric ELSE 0 END), 0)`,
      change24h: sql<string>`COALESCE(
        SUM(CASE WHEN ${exchangeAssets.amount}::numeric > 0 THEN ${exchangeAssets.valueUsd}::numeric * ${exchangeAssets.change24h}::numeric / 100 ELSE 0 END), 0
      )`,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(whereClause);

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

export async function getAssets(userId: string, mode?: 'live' | 'testnet') {
  const sandbox = await resolveSandbox(userId, mode);
  const sandboxClause = sandbox === null ? [] : [eq(exchangeConnections.sandbox, sandbox)];

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
      sandbox: exchangeConnections.sandbox,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(
      and(
        eq(exchangeConnections.userId, userId),
        ...sandboxClause,
        sql`${exchangeAssets.amount}::numeric > 0`,
      ),
    );

  return rows;
}

export async function getEquityHistory(userId: string, days = 30, granularity: 'hourly' | 'daily' = 'daily') {
  // For short timeframes (≤2 days) use hourly snapshots, else daily
  const useHourly = granularity === 'hourly';

  // Live equity: exchange portfolio snapshots (real exchange balances only)
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
        sql`COALESCE(portfolio_snapshots.granularity, 'daily') = ${useHourly ? 'hourly' : 'daily'}`,
        gte(portfolioSnapshots.date, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(portfolioSnapshots.date);

  // Shadow equity: cumulative PnL from paper/shadow bot positions only
  const shadowPositions = await db
    .select({
      closedAt: botPositions.closedAt,
      pnl: botPositions.pnl,
    })
    .from(botPositions)
    .where(
      and(
        eq(botPositions.userId, userId),
        eq(botPositions.status, 'closed'),
        eq(botPositions.isPaper, true),
        gte(botPositions.closedAt, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(botPositions.closedAt);

  // Build shadow equity curve (cumulative PnL, starting at 0)
  let shadowCum = 0;
  const shadowEquityData: number[] = shadowPositions.length > 0 ? [0] : [];
  const shadowDates: (Date | string)[] = shadowPositions.length > 0
    ? [new Date(Date.now() - days * 86400000)]
    : [];
  for (const p of shadowPositions) {
    shadowCum += parseFloat(p.pnl ?? '0');
    shadowEquityData.push(Math.round(shadowCum * 100) / 100);
    shadowDates.push(p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt ?? Date.now()));
  }

  if (snapshots.length > 0) {
    // Real live exchange data available
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
      shadowEquityData,
      shadowDates,
      days,
      isRealData: true,
    };
  }

  // No live snapshots — return empty live equity, but still return shadow equity
  const assets = await getAssets(userId);
  const totalNow = assets.reduce((s, a) => s + parseFloat(String(a.valueUsd)), 0);

  if (totalNow === 0 && shadowEquityData.length === 0) {
    return { equityData: [], dates: [], detailed: [], shadowEquityData: [], shadowDates: [], days, isRealData: false };
  }

  const liveEquityData = totalNow > 0 ? [totalNow] : [];
  const liveDates = totalNow > 0 ? [new Date()] : [];

  return {
    equityData: liveEquityData,
    dates: liveDates,
    detailed: liveEquityData.map(v => ({ date: new Date(), value: v, change: 0, changePercent: 0 })),
    shadowEquityData,
    shadowDates,
    days,
    isRealData: totalNow > 0,
  };
}

export async function getAllocation(userId: string, mode?: 'live' | 'testnet') {
  const sandbox = await resolveSandbox(userId, mode);
  const sandboxClause = sandbox === null ? [] : [eq(exchangeConnections.sandbox, sandbox)];

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
    .where(and(eq(exchangeConnections.userId, userId), ...sandboxClause))
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
