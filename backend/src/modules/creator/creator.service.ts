import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { bots, botStatistics, botSubscriptions, reviews, creatorEarnings } from '../../db/schema/bots.js';
import { payments } from '../../db/schema/payments.js';
import { NotFoundError } from '../../lib/errors.js';

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
  const totalRevenue = Math.max(earningsTotal, paymentsTotal);

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
      version: bots.version,
      createdAt: bots.createdAt,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
      reviewCount: botStatistics.reviewCount,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.creatorId, userId))
    .orderBy(desc(bots.createdAt));

  return rows;
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
