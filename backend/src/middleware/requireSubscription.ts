/**
 * requireSubscription middleware
 *
 * Usage in a route:
 *   preHandler: [authenticate, requireSubscription],
 *
 * Blocks the request with 403 if the authenticated user does not have an
 * active Pro subscription (or their subscription has expired).
 * Also stops all running bot instances when a subscription expires.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database.js';
import { userSubscriptions, subscriptionPlans } from '../db/schema/subscriptions.js';
import { eq, and } from 'drizzle-orm';
import { ForbiddenError } from '../lib/errors.js';

export class SubscriptionRequiredError extends ForbiddenError {
  constructor() {
    super('An active Pro subscription is required to use this feature. Subscribe in the app to unlock.');
  }
}

/** Returns the user's active subscription row if they are Pro, null otherwise. */
export async function getActiveProSubscription(userId: string) {
  const [sub] = await db
    .select({
      id: userSubscriptions.id,
      status: userSubscriptions.status,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      tier: subscriptionPlans.tier,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        eq(subscriptionPlans.tier, 'pro'),
      ),
    )
    .limit(1);

  if (!sub) return null;

  // Also verify period hasn't expired (belt-and-suspenders — job handles this proactively)
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) {
    // Mark expired in DB
    await db.update(userSubscriptions)
      .set({ status: 'expired', updatedAt: new Date() } as any)
      .where(eq(userSubscriptions.id, sub.id));
    return null;
  }

  return sub;
}

/** Fastify preHandler — throws 403 if not Pro. Admin role always passes. */
export async function requireSubscription(request: FastifyRequest, _reply: FastifyReply) {
  if (request.user.role === 'admin') return;
  const sub = await getActiveProSubscription(request.user.userId);
  if (!sub) throw new SubscriptionRequiredError();
}
