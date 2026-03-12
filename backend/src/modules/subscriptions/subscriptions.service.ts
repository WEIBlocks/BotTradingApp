import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { subscriptionPlans, userSubscriptions } from '../../db/schema/subscriptions.js';
import { users } from '../../db/schema/users.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { stripe } from '../../config/stripe.js';
import { isStripeConfigured } from '../../lib/stripe-helpers.js';
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
      stripeSubId: userSubscriptions.stripeSubId,
      status: userSubscriptions.status,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      createdAt: userSubscriptions.createdAt,
      planName: subscriptionPlans.name,
      planPrice: subscriptionPlans.price,
      planPeriod: subscriptionPlans.period,
      planFeatures: subscriptionPlans.features,
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

/**
 * Get or create a Stripe customer for the given user.
 */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  // Check if we have a Stripe customer ID stored on any existing subscription
  const [existingSub] = await db
    .select({ stripeCustId: userSubscriptions.stripeCustId })
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .limit(1);

  if (existingSub?.stripeCustId) {
    return existingSub.stripeCustId;
  }

  // Fetch user email for Stripe customer creation
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const customer = await stripe.customers.create({
    email: user?.email,
    name: user?.name,
    metadata: { userId },
  });

  return customer.id;
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

  if (isStripeConfigured() && plan.stripePriceId) {
    // Create Stripe subscription
    const customerId = await getOrCreateStripeCustomer(userId);

    const stripeSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId, planId },
    });

    const now = new Date();
    const periodEnd = new Date(stripeSub.current_period_end * 1000);

    const [subscription] = await db
      .insert(userSubscriptions)
      .values({
        userId,
        planId,
        stripeSubId: stripeSub.id,
        stripeCustId: customerId,
        status: stripeSub.status === 'active' ? 'active' : 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    // Extract clientSecret from the latest invoice's payment intent
    const invoice = stripeSub.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;
    const clientSecret = typeof paymentIntent === 'object'
      ? paymentIntent?.client_secret
      : null;

    return { ...subscription, clientSecret };
  }

  // Dev mode: create DB record directly
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

  // If Stripe is configured and the subscription has a Stripe ID, cancel in Stripe
  if (isStripeConfigured() && activeSub.stripeSubId) {
    try {
      await stripe.subscriptions.cancel(activeSub.stripeSubId);
    } catch (err) {
      console.warn('Failed to cancel Stripe subscription:', (err as Error).message);
    }
  }

  // Always update DB status
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
