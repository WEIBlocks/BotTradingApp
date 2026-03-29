import { eq, and, desc, asc, sql, count, gte, lte, between, inArray, type Column } from 'drizzle-orm';

/** Safe inArray that handles empty arrays and Neon UUID serialization */
function safeInArray(column: Column, ids: string[]) {
  if (ids.length === 0) return sql`false`;
  if (ids.length === 1) return eq(column, ids[0]);
  return inArray(column, ids);
}
import { db } from '../../config/database.js';
import { bots, botStatistics, botSubscriptions, botVersions, shadowSessions, reviews, creatorEarnings } from '../../db/schema/bots.js';
import { trades } from '../../db/schema/trades.js';
import { botDecisions } from '../../db/schema/decisions';
import { payments } from '../../db/schema/payments.js';
import { users } from '../../db/schema/users.js';
import { arenaSessions, arenaGladiators } from '../../db/schema/arena.js';
import { creatorAnalytics, botExperiments, userBotProfitability, botPatternAnalysis } from '../../db/schema/analytics.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { llmChat } from '../../config/ai.js';

export async function getStats(userId: string) {
  // Count creator's bots
  const [botCount] = await db
    .select({ count: count() })
    .from(bots)
    .where(eq(bots.creatorId, userId));

  // Count total subscribers across creator's bots
  const [subCount] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
    .where(
      and(
        eq(bots.creatorId, userId),
        eq(botSubscriptions.status, 'active'),
      ),
    );

  // Average rating across creator's bots
  const [ratingResult] = await db
    .select({
      avgRating: sql<string>`coalesce(avg(${reviews.rating}), 0)`,
      totalReviews: count(),
    })
    .from(reviews)
    .innerJoin(bots, eq(reviews.botId, bots.id))
    .where(eq(bots.creatorId, userId));

  // Total revenue (sum of creator earnings)
  const [earningsResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${creatorEarnings.creatorEarning}::numeric), 0)`,
    })
    .from(creatorEarnings)
    .where(eq(creatorEarnings.creatorId, userId));

  // Fallback: also check payments table for backward compat
  const [paymentResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'succeeded'),
        eq(payments.type, 'bot_purchase'),
      ),
    );

  const earningsTotal = parseFloat(earningsResult?.total ?? '0');
  const paymentsTotal = parseFloat(paymentResult?.total ?? '0');
  const totalRevenue = earningsTotal + paymentsTotal;

  return {
    totalBots: botCount?.count ?? 0,
    activeSubscribers: subCount?.count ?? 0,
    avgRating: Number(ratingResult?.avgRating ?? 0).toFixed(2),
    totalReviews: ratingResult?.totalReviews ?? 0,
    totalRevenue: totalRevenue.toFixed(2),
  };
}

export async function getMonthlyRevenue(userId: string, months: number = 6) {
  // Pull from creator_earnings first, fallback to payments
  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
      coalesce(sum(creator_earning::numeric), 0) as revenue
    FROM creator_earnings
    WHERE creator_id = ${userId}
      AND created_at >= now() - (${months} || ' months')::interval
    GROUP BY date_trunc('month', created_at)
    ORDER BY month DESC
  `);

  // If no earnings yet, try payments table
  if ((result as unknown as any[]).length === 0) {
    const fallback = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', p.created_at), 'YYYY-MM') as month,
        coalesce(sum(p.amount::numeric), 0) as revenue
      FROM payments p
      JOIN bots b ON (p.metadata->>'itemId')::uuid = b.id
      WHERE b.creator_id = ${userId}
        AND p.status = 'succeeded'
        AND p.type = 'bot_purchase'
        AND p.created_at >= now() - (${months} || ' months')::interval
      GROUP BY date_trunc('month', p.created_at)
      ORDER BY month DESC
    `);
    return fallback as unknown as Record<string, unknown>[];
  }

  return result as unknown as Record<string, unknown>[];
}

export async function getCreatorBots(userId: string) {
  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      creatorFeePercent: bots.creatorFeePercent,
      platformFeePercent: bots.platformFeePercent,
      status: bots.status,
      isPublished: bots.isPublished,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      config: bots.config,
      version: bots.version,
      createdAt: bots.createdAt,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      maxDrawdown: botStatistics.maxDrawdown,
      sharpeRatio: botStatistics.sharpeRatio,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
      reviewCount: botStatistics.reviewCount,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.creatorId, userId))
    .orderBy(desc(bots.createdAt));

  // Enrich each bot with trade/position counts and earnings
  const enriched = await Promise.all(rows.map(async (bot) => {
    const posQuery: any = await db.execute(sql`
      SELECT
        count(DISTINCT user_id)::int as total_users,
        count(id)::int as total_positions,
        count(id) FILTER (WHERE status = 'open')::int as open_positions,
        count(id) FILTER (WHERE status = 'closed')::int as closed_positions,
        COALESCE(sum(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as total_pnl
      FROM bot_positions WHERE bot_id = ${bot.id}
    `);
    const subQuery: any = await db.execute(sql`
      SELECT count(id)::int as total_subscribers
      FROM bot_subscriptions WHERE bot_id = ${bot.id}
    `);
    const s = { ...(posQuery[0] || {}), ...(subQuery[0] || {}) };

    // Get total decisions with action breakdown
    const decStats: any = await db.execute(sql`
      SELECT
        count(*)::int as total,
        count(*) FILTER (WHERE action = 'BUY')::int as buys,
        count(*) FILTER (WHERE action = 'SELL')::int as sells,
        count(*) FILTER (WHERE action = 'HOLD')::int as holds
      FROM bot_decisions WHERE bot_id = ${bot.id}
    `);
    const ds = decStats[0] || {};

    // Get total earnings for this bot
    const [earning] = await db.select({ total: sql<string>`COALESCE(sum(creator_earning::numeric), 0)` })
      .from(creatorEarnings).where(eq(creatorEarnings.botId, bot.id));

    // Per-user breakdown: each user's decisions, trades (buys+sells), and P&L
    const perUserStats: any = await db.execute(sql`
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        count(d.id)::int as decisions,
        count(d.id) FILTER (WHERE d.action = 'BUY')::int as buys,
        count(d.id) FILTER (WHERE d.action = 'SELL')::int as sells,
        count(d.id) FILTER (WHERE d.action = 'HOLD')::int as holds,
        COALESCE((
          SELECT count(*)::int FROM bot_positions bp
          WHERE bp.bot_id = ${bot.id} AND bp.user_id = u.id
        ), 0) as positions,
        COALESCE((
          SELECT sum(bp.pnl::numeric) FROM bot_positions bp
          WHERE bp.bot_id = ${bot.id} AND bp.user_id = u.id AND bp.status = 'closed'
        ), 0) as pnl,
        COALESCE((
          SELECT bs.status::text FROM bot_subscriptions bs
          WHERE bs.bot_id = ${bot.id} AND bs.user_id = u.id
          ORDER BY bs.created_at DESC LIMIT 1
        ), 'none') as sub_status,
        COALESCE((
          SELECT bs.mode::text FROM bot_subscriptions bs
          WHERE bs.bot_id = ${bot.id} AND bs.user_id = u.id
          ORDER BY bs.created_at DESC LIMIT 1
        ), 'paper') as sub_mode
      FROM bot_decisions d
      JOIN users u ON u.id = d.user_id
      WHERE d.bot_id = ${bot.id}
      GROUP BY u.id, u.name, u.email
      ORDER BY count(d.id) DESC
    `);

    const userBreakdown = (perUserStats as any[] || []).map((r: any) => ({
      userId: r.user_id,
      name: r.user_name || 'Unknown',
      email: r.user_email || '',
      decisions: Number(r.decisions),
      buys: Number(r.buys),
      sells: Number(r.sells),
      holds: Number(r.holds),
      trades: Number(r.buys) + Number(r.sells),
      positions: Number(r.positions),
      pnl: Number(parseFloat(r.pnl ?? '0').toFixed(2)),
      status: r.sub_status,
      mode: r.sub_mode,
    }));

    return {
      ...bot,
      totalUsers: Number(s.total_users ?? 0),
      totalPositions: Number(s.total_positions ?? 0),
      openPositions: Number(s.open_positions ?? 0),
      closedPositions: Number(s.closed_positions ?? 0),
      totalPnl: Number(parseFloat(s.total_pnl ?? '0').toFixed(2)),
      totalDecisions: Number(ds.total ?? 0),
      totalBuys: Number(ds.buys ?? 0),
      totalSells: Number(ds.sells ?? 0),
      totalHolds: Number(ds.holds ?? 0),
      totalTrades: Number(ds.buys ?? 0) + Number(ds.sells ?? 0),
      totalSubscribers: Number(s.total_subscribers ?? 0),
      totalEarnings: Number(parseFloat(earning?.total ?? '0').toFixed(2)),
      userBreakdown,
    };
  }));

  return enriched;
}

export async function publishBot(userId: string, botId: string) {
  const [updated] = await db
    .update(bots)
    .set({ status: 'approved', isPublished: true, updatedAt: new Date() })
    .where(
      and(
        eq(bots.id, botId),
        eq(bots.creatorId, userId),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotFoundError('Bot');
  }

  return updated;
}

// ─── Earnings & Monetization ────────────────────────────────────────────────

export async function getEarningsSummary(userId: string) {
  // Total lifetime earnings
  const [totals] = await db
    .select({
      totalEarnings: sql<string>`coalesce(sum(${creatorEarnings.creatorEarning}::numeric), 0)`,
      totalPlatformFees: sql<string>`coalesce(sum(${creatorEarnings.platformFee}::numeric), 0)`,
      totalSubscriberProfits: sql<string>`coalesce(sum(${creatorEarnings.subscriberProfit}::numeric), 0)`,
      count: count(),
    })
    .from(creatorEarnings)
    .where(eq(creatorEarnings.creatorId, userId));

  // Pending (unpaid) earnings
  const [pending] = await db
    .select({
      amount: sql<string>`coalesce(sum(${creatorEarnings.creatorEarning}::numeric), 0)`,
    })
    .from(creatorEarnings)
    .where(
      and(
        eq(creatorEarnings.creatorId, userId),
        eq(creatorEarnings.status, 'pending'),
      ),
    );

  // Active subscribers count
  const [subs] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
    .where(
      and(
        eq(bots.creatorId, userId),
        eq(botSubscriptions.status, 'active'),
      ),
    );

  // Per-bot earnings breakdown
  const botEarnings = await db
    .select({
      botId: creatorEarnings.botId,
      botName: bots.name,
      totalEarning: sql<string>`sum(${creatorEarnings.creatorEarning}::numeric)`,
      totalSubscriberProfit: sql<string>`sum(${creatorEarnings.subscriberProfit}::numeric)`,
      transactions: count(),
    })
    .from(creatorEarnings)
    .innerJoin(bots, eq(creatorEarnings.botId, bots.id))
    .where(eq(creatorEarnings.creatorId, userId))
    .groupBy(creatorEarnings.botId, bots.name);

  // Recent earnings
  const recent = await db
    .select({
      id: creatorEarnings.id,
      botName: bots.name,
      subscriberProfit: creatorEarnings.subscriberProfit,
      creatorFeePercent: creatorEarnings.creatorFeePercent,
      creatorEarning: creatorEarnings.creatorEarning,
      platformFee: creatorEarnings.platformFee,
      status: creatorEarnings.status,
      periodStart: creatorEarnings.periodStart,
      periodEnd: creatorEarnings.periodEnd,
      createdAt: creatorEarnings.createdAt,
    })
    .from(creatorEarnings)
    .innerJoin(bots, eq(creatorEarnings.botId, bots.id))
    .where(eq(creatorEarnings.creatorId, userId))
    .orderBy(desc(creatorEarnings.createdAt))
    .limit(20);

  return {
    totalEarnings: parseFloat(totals?.totalEarnings ?? '0'),
    totalPlatformFees: parseFloat(totals?.totalPlatformFees ?? '0'),
    totalSubscriberProfits: parseFloat(totals?.totalSubscriberProfits ?? '0'),
    pendingPayout: parseFloat(pending?.amount ?? '0'),
    activeSubscribers: subs?.count ?? 0,
    transactionCount: totals?.count ?? 0,
    botEarnings: botEarnings.map(be => ({
      botId: be.botId,
      botName: be.botName,
      totalEarning: parseFloat(be.totalEarning ?? '0'),
      totalSubscriberProfit: parseFloat(be.totalSubscriberProfit ?? '0'),
      transactions: be.transactions,
    })),
    recentEarnings: recent,
  };
}

export async function getEarningsProjection(userId: string) {
  // Get creator's bots with their fee configs and active subscriber counts
  const botsWithSubs = await db
    .select({
      id: bots.id,
      name: bots.name,
      creatorFeePercent: bots.creatorFeePercent,
      platformFeePercent: bots.platformFeePercent,
      activeUsers: botStatistics.activeUsers,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(
      and(
        eq(bots.creatorId, userId),
        eq(bots.isPublished, true),
      ),
    );

  return botsWithSubs.map(b => ({
    botId: b.id,
    botName: b.name,
    creatorFeePercent: parseFloat(b.creatorFeePercent ?? '10'),
    platformFeePercent: parseFloat(b.platformFeePercent ?? '3'),
    activeUsers: b.activeUsers ?? 0,
  }));
}

export async function getAISuggestions(userId: string) {
  try {
    const { getCreatorSuggestions } = await import('../ai/ai.service.js');
    return await getCreatorSuggestions(userId);
  } catch {
    return [
      {
        id: '1',
        title: 'Add Stop-Loss Parameters',
        description: 'Consider adding configurable stop-loss levels to reduce downside risk for your bot subscribers.',
        category: 'risk_management',
        priority: 'high',
      },
      {
        id: '2',
        title: 'Implement Multi-Timeframe Analysis',
        description: 'Enhance your strategy by incorporating signals from multiple timeframes for better entry confirmation.',
        category: 'strategy',
        priority: 'medium',
      },
      {
        id: '3',
        title: 'Optimize Fee Structure',
        description: 'Your current pricing could be more competitive. Consider a tiered pricing model based on AUM.',
        category: 'pricing',
        priority: 'medium',
      },
    ];
  }
}

// ─── Engagement Analytics ──────────────────────────────────────────────────

export async function getEngagementMetrics(creatorId: string, days: number = 30) {
  const creatorBotIds = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.creatorId, creatorId));
  const botIds = creatorBotIds.map(b => b.id);

  if (botIds.length === 0) {
    return {
      summary: { totalViews: 0, totalPurchases: 0, conversionRate: 0, subscriberGrowth: 0, churnRate: 0, avgRevenuePerUser: 0 },
      daily: [],
    };
  }

  // Check creatorAnalytics table first
  const analyticsRows = await db
    .select()
    .from(creatorAnalytics)
    .where(
      and(
        eq(creatorAnalytics.creatorId, creatorId),
        gte(creatorAnalytics.date, sql`now() - (${days} || ' days')::interval`),
      ),
    )
    .orderBy(asc(creatorAnalytics.date));

  if (analyticsRows.length > 0) {
    const totalViews = analyticsRows.reduce((s, r) => s + (r.botViews ?? 0), 0);
    const totalPurchases = analyticsRows.reduce((s, r) => s + (r.botPurchases ?? 0), 0);
    const totalNew = analyticsRows.reduce((s, r) => s + (r.newSubscribers ?? 0), 0);
    const totalChurned = analyticsRows.reduce((s, r) => s + (r.churnedSubscribers ?? 0), 0);
    const totalRevenue = analyticsRows.reduce((s, r) => s + (r.totalRevenue ?? 0), 0);
    const lastRow = analyticsRows[analyticsRows.length - 1];
    const activeSubs = lastRow?.activeSubscribers ?? 0;

    return {
      summary: {
        totalViews,
        totalPurchases,
        conversionRate: totalViews > 0 ? ((totalPurchases / totalViews) * 100) : 0,
        subscriberGrowth: totalNew - totalChurned,
        churnRate: (totalNew + activeSubs) > 0 ? ((totalChurned / (totalNew + activeSubs)) * 100) : 0,
        avgRevenuePerUser: activeSubs > 0 ? (totalRevenue / activeSubs) : 0,
      },
      daily: analyticsRows.map(r => ({
        date: r.date,
        subscribers: r.activeSubscribers,
        newSubscribers: r.newSubscribers,
        churned: r.churnedSubscribers,
        revenue: r.totalRevenue,
        views: r.botViews,
        purchases: r.botPurchases,
      })),
    };
  }

  // Fallback: compute from live data
  const [activeSubs] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(and(safeInArray(botSubscriptions.botId, botIds), eq(botSubscriptions.status, 'active')));

  const [recentSubs] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(
      and(
        safeInArray(botSubscriptions.botId, botIds),
        gte(botSubscriptions.createdAt, sql`now() - (${days} || ' days')::interval`),
      ),
    );

  const [stoppedSubs] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(
      and(
        safeInArray(botSubscriptions.botId, botIds),
        eq(botSubscriptions.status, 'stopped'),
        gte(botSubscriptions.updatedAt, sql`now() - (${days} || ' days')::interval`),
      ),
    );

  const [revenueResult] = await db
    .select({ total: sql<string>`coalesce(sum(creator_earning::numeric), 0)` })
    .from(creatorEarnings)
    .where(
      and(
        eq(creatorEarnings.creatorId, creatorId),
        gte(creatorEarnings.createdAt, sql`now() - (${days} || ' days')::interval`),
      ),
    );

  const active = activeSubs?.count ?? 0;
  const newSubs = recentSubs?.count ?? 0;
  const churned = stoppedSubs?.count ?? 0;
  const revenue = parseFloat(revenueResult?.total ?? '0');

  return {
    summary: {
      totalViews: 0,
      totalPurchases: newSubs,
      conversionRate: 0,
      subscriberGrowth: newSubs - churned,
      churnRate: (active + newSubs) > 0 ? ((churned / (active + newSubs)) * 100) : 0,
      avgRevenuePerUser: active > 0 ? (revenue / active) : 0,
    },
    daily: [],
  };
}

// ─── User Profitability ───────────────────────────────────────────────────

export async function getUserProfitability(creatorId: string) {
  const creatorBotIds = await db
    .select({ id: bots.id })
    .from(bots)
    .where(eq(bots.creatorId, creatorId));
  const botIds = creatorBotIds.map(b => b.id);

  if (botIds.length === 0) {
    return { topEarners: [], distribution: { profitable: 0, breakeven: 0, losing: 0 }, avgLTV: 0, totalUsers: 0 };
  }

  // Check profitability table first
  const profRows = await db
    .select()
    .from(userBotProfitability)
    .where(eq(userBotProfitability.creatorId, creatorId))
    .orderBy(desc(userBotProfitability.totalProfit))
    .limit(50);

  if (profRows.length > 0) {
    const profitable = profRows.filter(r => (r.totalProfit ?? 0) > 0).length;
    const losing = profRows.filter(r => (r.totalProfit ?? 0) < 0).length;
    const breakeven = profRows.length - profitable - losing;
    const avgLTV = profRows.reduce((s, r) => s + (r.totalProfit ?? 0), 0) / profRows.length;

    // Get usernames for top earners
    const topUserIds = profRows.slice(0, 10).map(r => r.userId);
    const userNames = topUserIds.length > 0 ? await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(safeInArray(users.id, topUserIds)) : [];
    const nameMap = new Map(userNames.map(u => [u.id, u.name || u.email]));

    return {
      topEarners: profRows.slice(0, 10).map(r => ({
        userId: r.userId,
        userName: nameMap.get(r.userId) ?? 'User',
        botId: r.botId,
        totalProfit: r.totalProfit,
        totalTrades: r.totalTrades,
        winRate: r.winRate,
        subscriptionDays: r.subscriptionDays,
        isActive: r.isActive,
      })),
      distribution: { profitable, breakeven, losing },
      avgLTV,
      totalUsers: profRows.length,
    };
  }

  // Fallback: compute from subscriptions
  const subs = await db
    .select({
      userId: botSubscriptions.userId,
      botId: botSubscriptions.botId,
      status: botSubscriptions.status,
      createdAt: botSubscriptions.createdAt,
    })
    .from(botSubscriptions)
    .where(safeInArray(botSubscriptions.botId, botIds));

  return {
    topEarners: [],
    distribution: { profitable: 0, breakeven: 0, losing: subs.length },
    avgLTV: 0,
    totalUsers: subs.length,
  };
}

// ─── A/B Test Experiments ──────────────────────────────────────────────────

export async function createExperiment(creatorId: string, data: {
  botId: string;
  name: string;
  description?: string;
  variantAConfig?: Record<string, unknown>;
  variantBConfig?: Record<string, unknown>;
}) {
  // Verify bot belongs to creator
  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, data.botId), eq(bots.creatorId, creatorId)));
  if (!bot) throw new NotFoundError('Bot');

  // Check no running experiment for this bot
  const [existing] = await db
    .select({ id: botExperiments.id })
    .from(botExperiments)
    .where(
      and(
        eq(botExperiments.botId, data.botId),
        eq(botExperiments.status, 'running'),
      ),
    )
    .limit(1);
  if (existing) throw new ConflictError('An experiment is already running for this bot');

  const [experiment] = await db
    .insert(botExperiments)
    .values({
      creatorId,
      botId: data.botId,
      name: data.name,
      description: data.description,
      variantAConfig: data.variantAConfig ?? {},
      variantBConfig: data.variantBConfig ?? {},
      status: 'running',
      startDate: new Date(),
    })
    .returning();

  return experiment;
}

export async function getExperiments(creatorId: string) {
  return db
    .select({
      id: botExperiments.id,
      botId: botExperiments.botId,
      botName: bots.name,
      name: botExperiments.name,
      description: botExperiments.description,
      status: botExperiments.status,
      variantASubscribers: botExperiments.variantASubscribers,
      variantBSubscribers: botExperiments.variantBSubscribers,
      variantARevenue: botExperiments.variantARevenue,
      variantBRevenue: botExperiments.variantBRevenue,
      variantAReturn: botExperiments.variantAReturn,
      variantBReturn: botExperiments.variantBReturn,
      variantAChurn: botExperiments.variantAChurn,
      variantBChurn: botExperiments.variantBChurn,
      winnerVariant: botExperiments.winnerVariant,
      confidence: botExperiments.confidence,
      startDate: botExperiments.startDate,
      endDate: botExperiments.endDate,
      createdAt: botExperiments.createdAt,
    })
    .from(botExperiments)
    .innerJoin(bots, eq(botExperiments.botId, bots.id))
    .where(eq(botExperiments.creatorId, creatorId))
    .orderBy(desc(botExperiments.createdAt));
}

export async function getExperimentResults(experimentId: string, creatorId: string) {
  const [exp] = await db
    .select()
    .from(botExperiments)
    .where(and(eq(botExperiments.id, experimentId), eq(botExperiments.creatorId, creatorId)));
  if (!exp) throw new NotFoundError('Experiment');

  // Calculate statistical significance (z-test for proportions)
  const nA = exp.variantASubscribers ?? 1;
  const nB = exp.variantBSubscribers ?? 1;
  const revA = exp.variantARevenue ?? 0;
  const revB = exp.variantBRevenue ?? 0;
  const retA = exp.variantAReturn ?? 0;
  const retB = exp.variantBReturn ?? 0;

  const avgRevA = nA > 0 ? revA / nA : 0;
  const avgRevB = nB > 0 ? revB / nB : 0;
  const diff = avgRevB - avgRevA;
  const pooled = (nA + nB) > 0 ? (revA + revB) / (nA + nB) : 0;
  const se = pooled > 0 ? Math.sqrt(pooled * (1 - pooled / 100) * (1/nA + 1/nB)) : 1;
  const zScore = se > 0 ? Math.abs(diff) / se : 0;
  const confidence = Math.min(99.9, zScore > 0 ? (1 - Math.exp(-0.5 * zScore * zScore)) * 100 : 0);

  let winner: string | null = null;
  if (confidence > 95) {
    winner = avgRevB > avgRevA ? 'B' : 'A';
  }

  return {
    experiment: exp,
    analysis: {
      avgRevenuePerUserA: avgRevA,
      avgRevenuePerUserB: avgRevB,
      returnA: retA,
      returnB: retB,
      churnA: exp.variantAChurn ?? 0,
      churnB: exp.variantBChurn ?? 0,
      zScore,
      confidence,
      winner,
      recommendation: winner
        ? `Variant ${winner} outperforms with ${confidence.toFixed(1)}% confidence. Consider applying Variant ${winner}'s configuration.`
        : `Not enough data yet (${confidence.toFixed(1)}% confidence). Need 95%+ to declare a winner.`,
    },
  };
}

export async function stopExperiment(experimentId: string, creatorId: string) {
  const [exp] = await db
    .update(botExperiments)
    .set({ status: 'completed', endDate: new Date() })
    .where(and(eq(botExperiments.id, experimentId), eq(botExperiments.creatorId, creatorId)))
    .returning();
  if (!exp) throw new NotFoundError('Experiment');
  return exp;
}

// ─── Bot Pattern Analysis ──────────────────────────────────────────────────

export async function getBotPatternAnalysis(botId: string, creatorId: string) {
  // Verify ownership
  const [bot] = await db
    .select({ id: bots.id, name: bots.name, strategy: bots.strategy, riskLevel: bots.riskLevel, tags: bots.tags, prompt: bots.prompt })
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.creatorId, creatorId)));
  if (!bot) throw new NotFoundError('Bot');

  // Check for existing recent analysis (< 24h old)
  const [existing] = await db
    .select()
    .from(botPatternAnalysis)
    .where(
      and(
        eq(botPatternAnalysis.botId, botId),
        gte(botPatternAnalysis.analysisDate, sql`now() - interval '24 hours'`),
      ),
    )
    .orderBy(desc(botPatternAnalysis.analysisDate))
    .limit(1);

  if (existing) return existing;

  // Generate new analysis via AI
  const [stats] = await db
    .select()
    .from(botStatistics)
    .where(eq(botStatistics.botId, botId));

  // Calculate shadow returns from balance changes
  const shadowResults = await db
    .select({ virtualBalance: shadowSessions.virtualBalance, currentBalance: shadowSessions.currentBalance, status: shadowSessions.status })
    .from(shadowSessions)
    .where(and(eq(shadowSessions.botId, botId), eq(shadowSessions.status, 'completed')))
    .limit(10);

  const arenaResults = await db
    .select({ finalReturn: arenaGladiators.finalReturn, rank: arenaGladiators.rank, isWinner: arenaGladiators.isWinner })
    .from(arenaGladiators)
    .where(eq(arenaGladiators.botId, botId))
    .limit(10);

  const shadowReturns = shadowResults.map(s => {
    const vb = parseFloat(s.virtualBalance ?? '0');
    const cb = parseFloat(s.currentBalance ?? '0');
    return vb > 0 ? (((cb - vb) / vb) * 100).toFixed(2) + '%' : 'N/A';
  });

  const analysisPrompt = `Analyze this trading bot and detect patterns:

Bot: ${bot.name}
Strategy: ${bot.strategy || 'Not specified'}
Risk Level: ${bot.riskLevel || 'Unknown'}
Tags: ${(bot.tags || []).join(', ')}
Prompt: ${bot.prompt || 'None'}

Performance Stats:
- 30d Return: ${stats?.return30d ?? 'N/A'}%
- Win Rate: ${stats?.winRate ?? 'N/A'}%
- Max Drawdown: ${stats?.maxDrawdown ?? 'N/A'}%
- Active Users: ${stats?.activeUsers ?? 0}
- Rating: ${stats?.avgRating ?? 'N/A'}

Shadow Mode Results: ${shadowReturns.join(', ') || 'None'}
Arena Results: ${arenaResults.map(a => `Rank ${a.rank}: ${a.finalReturn ?? 0}% ${a.isWinner ? '(WINNER)' : ''}`).join(', ') || 'None'}

Respond in JSON only:
{
  "detectedPatterns": [{"pattern": "momentum|mean_reversion|breakout|scalping|swing", "confidence": 0.0-1.0, "description": "..."}],
  "marketCorrelation": {"btc": 0.0-1.0, "eth": 0.0-1.0, "overall_market": 0.0-1.0},
  "bestConditions": "description of ideal market conditions",
  "worstConditions": "description of worst market conditions",
  "riskScore": 0.0-10.0,
  "consistencyScore": 0.0-10.0,
  "sharpeRatio": number,
  "maxDrawdown": number,
  "suggestedImprovements": [{"title": "...", "description": "...", "impact": "high|medium|low"}]
}`;

  try {
    const aiResponse = await llmChat(
      [{ role: 'user', content: analysisPrompt }],
      { system: 'You are a quantitative trading analyst. Respond only with valid JSON.' },
    );
    const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const analysis = JSON.parse(jsonMatch[0]);

    const [saved] = await db
      .insert(botPatternAnalysis)
      .values({
        botId,
        detectedPatterns: analysis.detectedPatterns,
        marketCorrelation: analysis.marketCorrelation,
        bestConditions: analysis.bestConditions,
        worstConditions: analysis.worstConditions,
        riskScore: analysis.riskScore,
        consistencyScore: analysis.consistencyScore,
        sharpeRatio: analysis.sharpeRatio,
        maxDrawdown: analysis.maxDrawdown,
        suggestedImprovements: analysis.suggestedImprovements,
      })
      .returning();

    return saved;
  } catch {
    // Return placeholder if AI fails
    return {
      botId,
      analysisDate: new Date(),
      detectedPatterns: [{ pattern: bot.strategy || 'unknown', confidence: 0.5, description: 'Based on bot configuration' }],
      marketCorrelation: { btc: 0.5, eth: 0.4, overall_market: 0.3 },
      bestConditions: 'Trending markets with clear direction',
      worstConditions: 'Low-volume sideways markets',
      riskScore: 5,
      consistencyScore: 5,
      sharpeRatio: 0,
      maxDrawdown: 0,
      suggestedImprovements: [
        { title: 'Add more shadow test data', description: 'Run more shadow mode sessions to get accurate pattern detection', impact: 'high' },
      ],
    };
  }
}

// ─── Churn Analysis ────────────────────────────────────────────────────────

export async function getChurnAnalysis(creatorId: string) {
  const creatorBotIds = await db
    .select({ id: bots.id, name: bots.name })
    .from(bots)
    .where(eq(bots.creatorId, creatorId));
  const botIds = creatorBotIds.map(b => b.id);
  const botNameMap = new Map(creatorBotIds.map(b => [b.id, b.name]));

  if (botIds.length === 0) {
    return { overallChurnRate: 0, monthlyChurn: [], botChurn: [], atRiskUsers: 0, retentionCurve: [] };
  }

  // Active vs stopped subscriptions
  const [active] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(and(safeInArray(botSubscriptions.botId, botIds), eq(botSubscriptions.status, 'active')));

  const [stopped] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(and(safeInArray(botSubscriptions.botId, botIds), eq(botSubscriptions.status, 'stopped')));

  const [total] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(safeInArray(botSubscriptions.botId, botIds));

  const totalCount = total?.count ?? 0;
  const stoppedCount = stopped?.count ?? 0;
  const activeCount = active?.count ?? 0;
  const overallChurnRate = totalCount > 0 ? (stoppedCount / totalCount) * 100 : 0;

  // Per-bot churn
  const botChurnData = await db
    .select({
      botId: botSubscriptions.botId,
      status: botSubscriptions.status,
      count: count(),
    })
    .from(botSubscriptions)
    .where(safeInArray(botSubscriptions.botId, botIds))
    .groupBy(botSubscriptions.botId, botSubscriptions.status);

  const botChurnMap = new Map<string, { active: number; stopped: number; total: number }>();
  for (const row of botChurnData) {
    const existing = botChurnMap.get(row.botId) ?? { active: 0, stopped: 0, total: 0 };
    if (row.status === 'active') existing.active = row.count;
    else if (row.status === 'stopped') existing.stopped = row.count;
    existing.total += row.count;
    botChurnMap.set(row.botId, existing);
  }

  const botChurn = Array.from(botChurnMap.entries()).map(([botId, data]) => ({
    botId,
    botName: botNameMap.get(botId) ?? 'Unknown',
    activeUsers: data.active,
    churnedUsers: data.stopped,
    churnRate: data.total > 0 ? ((data.stopped / data.total) * 100) : 0,
  }));

  // Monthly churn over last 6 months
  const monthlyChurnResult = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', updated_at), 'YYYY-MM') as month,
      count(*) filter (where status = 'stopped') as churned,
      count(*) as total
    FROM bot_subscriptions
    WHERE bot_id::text = ANY(${sql.raw(`ARRAY[${botIds.map(id => `'${id}'`).join(',')}]`)})
      AND updated_at >= now() - interval '6 months'
    GROUP BY date_trunc('month', updated_at)
    ORDER BY month
  `);

  // Estimate at-risk users (active but no recent activity)
  const [atRisk] = await db
    .select({ count: count() })
    .from(botSubscriptions)
    .where(
      and(
        safeInArray(botSubscriptions.botId, botIds),
        eq(botSubscriptions.status, 'active'),
        lte(botSubscriptions.updatedAt, sql`now() - interval '14 days'`),
      ),
    );

  return {
    overallChurnRate: Number(overallChurnRate.toFixed(1)),
    activeUsers: activeCount,
    totalUsers: totalCount,
    churnedUsers: stoppedCount,
    monthlyChurn: monthlyChurnResult as unknown as Record<string, unknown>[],
    botChurn: botChurn.sort((a, b) => b.churnRate - a.churnRate),
    atRiskUsers: atRisk?.count ?? 0,
  };
}

// ─── Enhanced Revenue Projection ───────────────────────────────────────────

export async function getEnhancedRevenueProjection(creatorId: string) {
  const stats = await getStats(creatorId);
  const churn = await getChurnAnalysis(creatorId);

  const currentRevenue = parseFloat(stats.totalRevenue);
  const activeSubs = stats.activeSubscribers as number;
  const churnRate = churn.overallChurnRate / 100; // monthly
  const growthRate = activeSubs > 0 ? 0.05 : 0; // assume 5% monthly growth base

  const project = (months: number, scenario: 'optimistic' | 'realistic' | 'pessimistic') => {
    const multipliers = { optimistic: 1.3, realistic: 1.0, pessimistic: 0.7 };
    const m = multipliers[scenario];
    const churnAdj = scenario === 'optimistic' ? churnRate * 0.5 : scenario === 'pessimistic' ? churnRate * 1.5 : churnRate;
    const growthAdj = growthRate * m;

    let subs = activeSubs;
    let totalRev = 0;
    const monthly: { month: number; revenue: number; subscribers: number }[] = [];

    const revenuePerSub = activeSubs > 0 ? currentRevenue / Math.max(activeSubs, 1) / 6 : 5; // avg monthly per subscriber

    for (let i = 1; i <= months; i++) {
      subs = Math.max(0, Math.round(subs * (1 + growthAdj - churnAdj)));
      const monthRev = subs * revenuePerSub;
      totalRev += monthRev;
      monthly.push({ month: i, revenue: Number(monthRev.toFixed(2)), subscribers: subs });
    }

    return { totalRevenue: Number(totalRev.toFixed(2)), finalSubscribers: subs, monthly };
  };

  return {
    currentMetrics: {
      activeSubscribers: activeSubs,
      monthlyChurnRate: churn.overallChurnRate,
      totalRevenue: currentRevenue,
    },
    projections: {
      threeMonth: { optimistic: project(3, 'optimistic'), realistic: project(3, 'realistic'), pessimistic: project(3, 'pessimistic') },
      sixMonth: { optimistic: project(6, 'optimistic'), realistic: project(6, 'realistic'), pessimistic: project(6, 'pessimistic') },
      twelveMonth: { optimistic: project(12, 'optimistic'), realistic: project(12, 'realistic'), pessimistic: project(12, 'pessimistic') },
    },
  };
}

// ─── Marketing Funnel ──────────────────────────────────────────────────────

export async function getMarketingMetrics(creatorId: string) {
  const creatorBotIds = await db
    .select({ id: bots.id, name: bots.name, isPublished: bots.isPublished, createdAt: bots.createdAt })
    .from(bots)
    .where(eq(bots.creatorId, creatorId));
  const botIds = creatorBotIds.map(b => b.id);

  if (botIds.length === 0) {
    return { funnel: { published: 0, purchased: 0, active: 0, retained: 0 }, conversionRates: {}, botPerformance: [] };
  }

  const publishedCount = creatorBotIds.filter(b => b.isPublished).length;

  const [purchased] = await db
    .select({ count: sql<number>`count(distinct ${botSubscriptions.userId})` })
    .from(botSubscriptions)
    .where(safeInArray(botSubscriptions.botId, botIds));

  const [activeUsers] = await db
    .select({ count: sql<number>`count(distinct ${botSubscriptions.userId})` })
    .from(botSubscriptions)
    .where(and(safeInArray(botSubscriptions.botId, botIds), eq(botSubscriptions.status, 'active')));

  const [reviewers] = await db
    .select({ count: sql<number>`count(distinct ${reviews.userId})` })
    .from(reviews)
    .where(safeInArray(reviews.botId, botIds));

  const purchasedCount = purchased?.count ?? 0;
  const activeCount = activeUsers?.count ?? 0;
  const reviewCount = reviewers?.count ?? 0;

  // Per-bot performance
  const botPerformance = await Promise.all(creatorBotIds.map(async (bot) => {
    const [subs] = await db
      .select({ total: count() })
      .from(botSubscriptions)
      .where(eq(botSubscriptions.botId, bot.id));
    const [activeSub] = await db
      .select({ total: count() })
      .from(botSubscriptions)
      .where(and(eq(botSubscriptions.botId, bot.id), eq(botSubscriptions.status, 'active')));
    const [rev] = await db
      .select({ total: sql<string>`coalesce(sum(creator_earning::numeric), 0)` })
      .from(creatorEarnings)
      .where(and(eq(creatorEarnings.botId, bot.id), eq(creatorEarnings.creatorId, creatorId)));

    return {
      botId: bot.id,
      botName: bot.name,
      isPublished: bot.isPublished,
      totalPurchases: subs?.total ?? 0,
      activeUsers: activeSub?.total ?? 0,
      revenue: parseFloat(rev?.total ?? '0'),
      retentionRate: (subs?.total ?? 0) > 0 ? (((activeSub?.total ?? 0) / (subs?.total ?? 1)) * 100) : 0,
    };
  }));

  return {
    funnel: {
      published: publishedCount,
      totalPurchases: purchasedCount,
      activeUsers: activeCount,
      reviewers: reviewCount,
    },
    conversionRates: {
      purchaseRate: publishedCount > 0 ? ((purchasedCount / publishedCount) * 100) : 0,
      retentionRate: purchasedCount > 0 ? ((activeCount / purchasedCount) * 100) : 0,
      reviewRate: purchasedCount > 0 ? ((reviewCount / purchasedCount) * 100) : 0,
    },
    botPerformance: botPerformance.sort((a, b) => b.revenue - a.revenue),
  };
}

// ─── Per-Subscriber Details for a Bot ───────────────────────────────────────

export async function getBotSubscriberDetails(botId: string, creatorId: string) {
  // Verify creator owns this bot
  const [bot] = await db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.creatorId, creatorId)));
  if (!bot) throw new NotFoundError('Bot');

  // Get all subscribers with their stats
  const subscribers = await db
    .select({
      subId: botSubscriptions.id,
      userId: botSubscriptions.userId,
      userName: users.name,
      userEmail: users.email,
      mode: botSubscriptions.mode,
      status: botSubscriptions.status,
      allocatedAmount: botSubscriptions.allocatedAmount,
      startedAt: botSubscriptions.createdAt,
    })
    .from(botSubscriptions)
    .leftJoin(users, eq(botSubscriptions.userId, users.id))
    .where(eq(botSubscriptions.botId, botId))
    .orderBy(desc(botSubscriptions.createdAt));

  // For each subscriber, get their position stats
  const { botPositions } = await import('../../db/schema/positions');
  const results = await Promise.all(subscribers.map(async (sub) => {
    const posStats: any = await db.execute(sql`
      SELECT
        count(*)::int as total_positions,
        count(*) FILTER (WHERE status = 'closed')::int as closed,
        count(*) FILTER (WHERE status = 'closed' AND pnl::numeric > 0)::int as wins,
        COALESCE(sum(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as total_pnl,
        COALESCE(avg(pnl_percent::numeric) FILTER (WHERE status = 'closed'), 0) as avg_return
      FROM bot_positions WHERE bot_id = ${botId} AND user_id = ${sub.userId}
    `);
    const ps = (posStats as any[])?.[0] || {};

    // Get earnings from this subscriber
    const [earning] = await db
      .select({ total: sql<string>`COALESCE(sum(creator_earning::numeric), 0)` })
      .from(creatorEarnings)
      .where(and(eq(creatorEarnings.botId, botId), eq(creatorEarnings.subscriberId, sub.userId)));

    return {
      ...sub,
      positions: Number(ps.total_positions ?? 0),
      closedPositions: Number(ps.closed ?? 0),
      wins: Number(ps.wins ?? 0),
      winRate: Number(ps.closed) > 0 ? Math.round((Number(ps.wins) / Number(ps.closed)) * 100) : 0,
      totalPnl: Number(parseFloat(ps.total_pnl ?? '0').toFixed(2)),
      avgReturn: Number(parseFloat(ps.avg_return ?? '0').toFixed(2)),
      creatorEarning: Number(parseFloat(earning?.total ?? '0').toFixed(2)),
    };
  }));

  return {
    botName: bot.name,
    totalSubscribers: results.length,
    activeSubscribers: results.filter(r => r.status === 'active').length,
    subscribers: results,
  };
}

// ─── Trade Summary for a Bot (all users aggregated) ─────────────────────────

export async function getBotTradeSummary(botId: string, creatorId: string) {
  const [bot] = await db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.creatorId, creatorId)));
  if (!bot) throw new NotFoundError('Bot');

  // Get all decisions for this bot
  const { botDecisions } = await import('../../db/schema/decisions');
  const decisionStats: any = await db.execute(sql`
    SELECT
      count(*)::int as total_decisions,
      count(*) FILTER (WHERE action = 'BUY')::int as buys,
      count(*) FILTER (WHERE action = 'SELL')::int as sells,
      count(*) FILTER (WHERE action = 'HOLD')::int as holds,
      count(*) FILTER (WHERE ai_called = true)::int as ai_calls,
      COALESCE(sum(tokens_cost), 0)::int as total_tokens,
      count(DISTINCT user_id)::int as unique_users
    FROM bot_decisions WHERE bot_id = ${botId}
  `);
  const ds = (decisionStats as any[])?.[0] || {};

  // Get position summary
  const positionStats: any = await db.execute(sql`
    SELECT
      count(*)::int as total,
      count(*) FILTER (WHERE status = 'open')::int as open_count,
      count(*) FILTER (WHERE status = 'closed')::int as closed_count,
      count(*) FILTER (WHERE status = 'closed' AND pnl::numeric > 0)::int as wins,
      count(*) FILTER (WHERE status = 'closed' AND pnl::numeric <= 0)::int as losses,
      COALESCE(sum(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as total_pnl,
      COALESCE(avg(pnl_percent::numeric) FILTER (WHERE status = 'closed'), 0) as avg_pnl_pct,
      COALESCE(max(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as best_trade,
      COALESCE(min(pnl::numeric) FILTER (WHERE status = 'closed'), 0) as worst_trade
    FROM bot_positions WHERE bot_id = ${botId}
  `);
  const ps = (positionStats as any[])?.[0] || {};

  // Recent trades (last 20 across all users)
  const recentTrades = await db
    .select({
      id: trades.id,
      symbol: trades.symbol,
      side: trades.side,
      amount: trades.amount,
      price: trades.price,
      pnl: trades.pnl,
      isPaper: trades.isPaper,
      executedAt: trades.executedAt,
      userName: users.name,
    })
    .from(trades)
    .leftJoin(users, eq(trades.userId, users.id))
    .where(
      sql`${trades.botSubscriptionId} IN (SELECT id FROM bot_subscriptions WHERE bot_id = ${botId})
          OR ${trades.shadowSessionId} IN (SELECT id FROM shadow_sessions WHERE bot_id = ${botId})`
    )
    .orderBy(desc(trades.executedAt))
    .limit(20);

  return {
    botName: bot.name,
    strategy: bot.strategy,
    decisions: {
      total: Number(ds.total_decisions ?? 0),
      buys: Number(ds.buys ?? 0),
      sells: Number(ds.sells ?? 0),
      holds: Number(ds.holds ?? 0),
      aiCalls: Number(ds.ai_calls ?? 0),
      totalTokensCost: Number(ds.total_tokens ?? 0),
      uniqueUsers: Number(ds.unique_users ?? 0),
    },
    positions: {
      total: Number(ps.total ?? 0),
      open: Number(ps.open_count ?? 0),
      closed: Number(ps.closed_count ?? 0),
      wins: Number(ps.wins ?? 0),
      losses: Number(ps.losses ?? 0),
      winRate: Number(ps.closed_count) > 0 ? Math.round((Number(ps.wins) / Number(ps.closed_count)) * 100) : 0,
      totalPnl: Number(parseFloat(ps.total_pnl ?? '0').toFixed(2)),
      avgPnlPercent: Number(parseFloat(ps.avg_pnl_pct ?? '0').toFixed(2)),
      bestTrade: Number(parseFloat(ps.best_trade ?? '0').toFixed(2)),
      worstTrade: Number(parseFloat(ps.worst_trade ?? '0').toFixed(2)),
    },
    recentTrades: recentTrades.map(t => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      amount: parseFloat(t.amount),
      price: parseFloat(t.price),
      pnl: t.pnl ? parseFloat(t.pnl) : null,
      isPaper: t.isPaper,
      executedAt: t.executedAt,
      userName: t.userName,
    })),
  };
}
