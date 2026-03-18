import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { subscriptionPlans, userSubscriptions } from '../../db/schema/subscriptions.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { sendNotification } from '../../lib/notify.js';

export async function getPlans() {
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true));

  return plans;
}

export async function getCurrentSubscription(userId: string) {
  const [subscription] = await db
    .select({
      id: userSubscriptions.id,
      userId: userSubscriptions.userId,
      planId: userSubscriptions.planId,
      status: userSubscriptions.status,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      createdAt: userSubscriptions.createdAt,
      planName: subscriptionPlans.name,
      planPrice: subscriptionPlans.price,
      planPeriod: subscriptionPlans.period,
      planFeatures: subscriptionPlans.features,
      tier: subscriptionPlans.tier,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
      ),
    )
    .limit(1);

  return subscription ?? null;
}

export async function subscribe(userId: string, planId: string) {
  // Check plan exists
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.id, planId),
        eq(subscriptionPlans.isActive, true),
      ),
    )
    .limit(1);

  if (!plan) {
    throw new NotFoundError('Subscription plan');
  }

  // Check if user already has an active subscription
  const existing = await getCurrentSubscription(userId);
  if (existing) {
    throw new ConflictError('User already has an active subscription');
  }

  // Create subscription — payment is handled via Google Play IAP on the mobile side
  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.period === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const [subscription] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      planId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .returning();

  await sendNotification(userId, {
    type: 'system',
    title: 'Subscription Active',
    body: `You are now subscribed to the ${plan.name} plan.`,
  }).catch(() => {});

  return subscription;
}

export async function cancel(userId: string) {
  // Find the active subscription
  const [activeSub] = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
      ),
    )
    .limit(1);

  if (!activeSub) {
    throw new NotFoundError('Active subscription');
  }

  // Update DB status — Google Play handles the actual cancellation
  const [updated] = await db
    .update(userSubscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(userSubscriptions.id, activeSub.id))
    .returning();

  await sendNotification(userId, {
    type: 'system',
    title: 'Subscription Cancelled',
    body: 'Your subscription has been cancelled.',
  }).catch(() => {});

  return updated;
}
