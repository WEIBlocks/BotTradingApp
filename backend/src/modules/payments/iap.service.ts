import { db } from '../../config/database.js';
import { payments } from '../../db/schema/payments.js';
import { userSubscriptions } from '../../db/schema/subscriptions.js';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';

// ─── Types ────────────────────────────────────────────────────────────────

interface VerifyReceiptData {
  purchaseToken: string;
  productId: string;
  packageName: string;
  type: 'subscription' | 'bot_purchase';
  itemId?: string;
}

interface VerifyResult {
  valid: boolean;
  expiresAt?: string;
  productId: string;
  orderId?: string;
}

// ─── Google Play verification ─────────────────────────────────────────────

/**
 * Verify a Google Play purchase receipt.
 *
 * In production, this would use the Google Play Developer API
 * (androidpublisher v3) with a service account to verify purchases.
 * For now, we accept all receipts in dev/test mode and record them.
 */
async function verifyWithGooglePlay(data: VerifyReceiptData): Promise<{valid: boolean; expiresAt?: string; orderId?: string}> {
  const googlePlayKey = env.GOOGLE_PLAY_SERVICE_KEY;

  if (!googlePlayKey) {
    // Dev mode — accept all purchases
    console.log('[IAP] Dev mode: accepting purchase without Google verification', {
      productId: data.productId,
      type: data.type,
    });
    return {
      valid: true,
      orderId: `dev_${Date.now()}`,
      expiresAt: data.type === 'subscription'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    };
  }

  // Production: Use Google Play Developer API
  // This would use googleapis or a direct REST call:
  // POST https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/{type}/{productId}/tokens/{token}
  //
  // For subscriptions: purchases.subscriptionsv2.get
  // For products: purchases.products.get
  //
  // For now, we'll do a basic validation
  try {
    const apiUrl = data.type === 'subscription'
      ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${data.packageName}/purchases/subscriptionsv2/tokens/${data.purchaseToken}`
      : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${data.packageName}/purchases/products/${data.productId}/tokens/${data.purchaseToken}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${googlePlayKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[IAP] Google Play verification failed:', response.status);
      return { valid: false };
    }

    const result = await response.json();

    if (data.type === 'subscription') {
      return {
        valid: result.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE',
        orderId: result.latestOrderId,
        expiresAt: result.lineItems?.[0]?.expiryTime,
      };
    } else {
      return {
        valid: result.purchaseState === 0, // 0 = purchased
        orderId: result.orderId,
      };
    }
  } catch (err) {
    console.error('[IAP] Google Play API error:', err);
    return { valid: false };
  }
}

// ─── Main verification function ───────────────────────────────────────────

export async function verifyReceipt(userId: string, data: VerifyReceiptData): Promise<VerifyResult> {
  // Verify with Google Play
  const verification = await verifyWithGooglePlay(data);

  if (!verification.valid) {
    return { valid: false, productId: data.productId };
  }

  // Record the payment
  const [payment] = await db.insert(payments).values({
    userId,
    type: data.type === 'subscription' ? 'subscription' : 'bot_purchase',
    amount: '0', // Price is determined by Google Play
    currency: 'USD',
    status: 'succeeded',
    stripePaymentId: data.purchaseToken, // Store purchase token for reference
    metadata: {
      source: 'google_play_iap',
      productId: data.productId,
      packageName: data.packageName,
      orderId: verification.orderId,
      purchaseToken: data.purchaseToken,
    },
  }).returning();

  // If it's a subscription, update subscription status
  if (data.type === 'subscription') {
    const [existing] = await db.select().from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId)).limit(1);

    if (existing) {
      await db.update(userSubscriptions)
        .set({
          status: 'active',
          currentPeriodEnd: verification.expiresAt ? new Date(verification.expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(userSubscriptions.id, existing.id));
    }
  }

  return {
    valid: true,
    productId: data.productId,
    orderId: verification.orderId,
    expiresAt: verification.expiresAt,
  };
}
