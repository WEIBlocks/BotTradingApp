import { eq, and, or } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { subscriptionPlans, userSubscriptions } from '../../db/schema/subscriptions.js';
import { NotFoundError } from '../../lib/errors.js';
import { sendNotification } from '../../lib/notify.js';

export async function getPlans() {
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
}

export async function getCurrentSubscription(userId: string) {
  const [sub] = await db
    .select({
      id: userSubscriptions.id,
      userId: userSubscriptions.userId,
      planId: userSubscriptions.planId,
      status: userSubscriptions.status,
      platform: userSubscriptions.platform,
      productId: userSubscriptions.productId,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      cancelledAt: userSubscriptions.cancelledAt,
      createdAt: userSubscriptions.createdAt,
      planName: subscriptionPlans.name,
      planPrice: subscriptionPlans.price,
      planPeriod: subscriptionPlans.period,
      planFeatures: subscriptionPlans.features,
      tier: subscriptionPlans.tier,
      googleProductId: subscriptionPlans.googleProductId,
      appleProductId: subscriptionPlans.appleProductId,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(userSubscriptions.createdAt)
    .limit(1);

  return sub ?? null;
}

/** Returns whether user currently has an active Pro subscription */
export async function isUserPro(userId: string): Promise<boolean> {
  const [sub] = await db
    .select({ id: userSubscriptions.id, status: userSubscriptions.status, currentPeriodEnd: userSubscriptions.currentPeriodEnd, tier: subscriptionPlans.tier })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, 'active'), eq(subscriptionPlans.tier, 'pro')))
    .limit(1);

  if (!sub) return false;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) return false;
  return true;
}

/**
 * Called AFTER successful IAP verification by iap.service.ts.
 * Idempotent — safe to call on renewal.
 */
export async function subscribe(userId: string, planId: string) {
  const [plan] = await db.select().from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.id, planId), eq(subscriptionPlans.isActive, true)))
    .limit(1);

  if (!plan) throw new NotFoundError('Subscription plan');

  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.period === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Upsert: update existing row if any, otherwise insert
  const [existing] = await db.select({ id: userSubscriptions.id })
    .from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1);

  if (existing) {
    const [updated] = await db.update(userSubscriptions).set({
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
      updatedAt: now,
    }).where(eq(userSubscriptions.id, existing.id)).returning();

    await sendNotification(userId, {
      type: 'system',
      title: '🎉 Subscription Active',
      body: `You're now on the ${plan.name} plan. All premium features unlocked!`,
      priority: 'high',
    }).catch(() => {});

    return updated;
  } else {
    const [created] = await db.insert(userSubscriptions).values({
      userId,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).returning();

    await sendNotification(userId, {
      type: 'system',
      title: '🎉 Subscription Active',
      body: `You're now on the ${plan.name} plan. All premium features unlocked!`,
      priority: 'high',
    }).catch(() => {});

    return created;
  }
}

export async function cancel(userId: string) {
  const [activeSub] = await db.select().from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, 'active')))
    .limit(1);

  if (!activeSub) throw new NotFoundError('Active subscription');

  const now = new Date();
  const [updated] = await db.update(userSubscriptions)
    .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
    .where(eq(userSubscriptions.id, activeSub.id))
    .returning();

  await sendNotification(userId, {
    type: 'system',
    title: 'Subscription Cancelled',
    body: 'Your subscription has been cancelled. Access continues until the current period ends.',
  }).catch(() => {});

  return updated;
}
