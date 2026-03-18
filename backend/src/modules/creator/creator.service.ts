import { eq, and, desc, sql, count, sum } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { bots, botStatistics, botSubscriptions, reviews } from '../../db/schema/bots.js';
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

  // Total revenue (sum of payments related to creator's bots)
  const [revenueResult] = await db
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

  return {
    totalBots: botCount?.count ?? 0,
    activeSubscribers: subCount?.count ?? 0,
    avgRating: Number(ratingResult?.avgRating ?? 0).toFixed(2),
    totalReviews: ratingResult?.totalReviews ?? 0,
    totalRevenue: revenueResult?.total ?? '0',
  };
}

export async function getMonthlyRevenue(userId: string, months: number = 6) {
  // Return monthly revenue breakdown for the past N months
  const result = await db.execute(sql`
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

export async function getAISuggestions(userId: string) {
  try {
    const { getCreatorSuggestions } = await import('../ai/ai.service.js');
    return await getCreatorSuggestions(userId);
  } catch {
    // Fallback to static suggestions if AI is unavailable
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
