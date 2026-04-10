/**
 * Subscription Expiry Job
 *
 * Runs every hour.  For each active Pro subscription that is about to expire
 * (within 24h) or already expired:
 *
 *  1. Attempt a re-verification of the stored purchase token with the store.
 *     If the store confirms still-active → extend period end, keep active.
 *  2. If expired and not renewed → mark status = 'expired',
 *     pause all running live bot subscriptions for that user,
 *     send a push notification.
 */

import { db } from '../config/database.js';
import { userSubscriptions, subscriptionPlans } from '../db/schema/subscriptions.js';
import { botSubscriptions } from '../db/schema/bots.js';
import { eq, and, lte, sql } from 'drizzle-orm';
import { sendNotification } from '../lib/notify.js';
import { renewSubscription } from '../modules/payments/iap.service.js';

async function pauseUserBots(userId: string) {
  // Pause all active/live bot subscriptions
  await db.update(botSubscriptions)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(
      eq(botSubscriptions.userId, userId),
      eq(botSubscriptions.status, 'active'),
    ));

  console.log(`[SubExpiry] Paused all live bots for user ${userId.slice(0, 8)}`);
}

async function checkExpiredSubscriptions() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find active Pro subscriptions expiring within 24 hours (or already expired)
  const expiring = await db
    .select({
      id: userSubscriptions.id,
      userId: userSubscriptions.userId,
      purchaseToken: userSubscriptions.purchaseToken,
      platform: userSubscriptions.platform,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      planName: subscriptionPlans.name,
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(userSubscriptions.status, 'active'),
        eq(subscriptionPlans.tier, 'pro'),
        lte(userSubscriptions.currentPeriodEnd, in24h),
      ),
    );

  if (expiring.length === 0) return;

  console.log(`[SubExpiry] Checking ${expiring.length} expiring subscription(s)...`);

  for (const sub of expiring) {
    const isExpired = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < now;

    // If there's a stored token, try to verify renewal with the store
    if (sub.purchaseToken) {
      const renewed = await renewSubscription(sub.id);
      if (renewed) {
        console.log(`[SubExpiry] Renewed subscription ${sub.id.slice(0, 8)} for user ${sub.userId.slice(0, 8)}`);
        continue;
      }
    }

    if (!isExpired) {
      // Expiring soon but not yet expired — just notify
      await sendNotification(sub.userId, {
        type: 'system',
        title: 'Subscription Expiring Soon',
        body: `Your ${sub.planName} subscription expires in less than 24 hours. Open the app to renew.`,
        priority: 'high',
      }).catch(() => {});
      continue;
    }

    // Expired and not renewed — downgrade user
    console.log(`[SubExpiry] Subscription expired for user ${sub.userId.slice(0, 8)}`);

    await db.update(userSubscriptions)
      .set({ status: 'expired', updatedAt: new Date() } as any)
      .where(eq(userSubscriptions.id, sub.id));

    // Pause all their live bots
    await pauseUserBots(sub.userId);

    // Notify user
    await sendNotification(sub.userId, {
      type: 'system',
      title: 'Subscription Expired',
      body: 'Your Pro subscription has expired. Your live bots have been paused. Renew to resume.',
      priority: 'high',
    }).catch(() => {});
  }
}

export async function startSubscriptionExpiryJob() {
  // Run immediately 30s after boot, then every hour
  setTimeout(checkExpiredSubscriptions, 30_000);
  setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);
  console.log('[SubExpiry] Subscription expiry job started (runs hourly)');
}
