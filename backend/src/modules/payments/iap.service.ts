/**
 * IAP Verification Service
 *
 * Supports:
 *  - Google Play (Android) — subscriptionsv2 + products API via service-account JWT
 *  - Apple App Store (iOS)  — legacy verifyReceipt endpoint (works for all receipt types)
 *
 * HOW TO GET CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 * GOOGLE_PLAY_SERVICE_KEY (paste entire JSON key as one-liner):
 *   1. Google Play Console → Setup → API access → link Google Cloud project
 *   2. Create a Service Account → grant "View financial data" role
 *   3. Keys → Add Key → JSON → download → paste minified JSON as env value
 *   Example: GOOGLE_PLAY_SERVICE_KEY={"type":"service_account","project_id":"...","private_key":"..."}
 *
 * GOOGLE_PLAY_PACKAGE_NAME:
 *   Your Android app package name, e.g. com.botttradeapp
 *
 * APPLE_SHARED_SECRET:
 *   App Store Connect → My Apps → {App} → Monetization → Subscriptions
 *   → App-Specific Shared Secret → Generate
 *
 * APPLE_BUNDLE_ID:
 *   Your iOS bundle identifier, e.g. com.botttradeapp
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../../config/database.js';
import { payments } from '../../db/schema/payments.js';
import { userSubscriptions, subscriptionPlans } from '../../db/schema/subscriptions.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { sendNotification } from '../../lib/notify.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifyReceiptData {
  /** Google Play purchase token OR Apple base64 receipt string */
  purchaseToken: string;
  productId: string;
  packageName: string;
  platform: 'android' | 'ios';
  type: 'subscription' | 'bot_purchase';
  /** planId from subscription_plans — required when type = 'subscription' */
  planId?: string;
}

interface StoreVerifyResult {
  valid: boolean;
  orderId?: string;
  expiresAt?: string;
}

// ─── Google Play OAuth2 token (cached, auto-refreshed) ───────────────────────

let _googleAccessToken: string | null = null;
let _googleTokenExpiry = 0;

async function getGoogleAccessToken(): Promise<string | null> {
  if (_googleAccessToken && Date.now() < _googleTokenExpiry - 60_000) {
    return _googleAccessToken;
  }

  const keyJson = env.GOOGLE_PLAY_SERVICE_KEY;
  if (!keyJson) return null;

  try {
    const key = JSON.parse(keyJson);
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })).toString('base64url');

    const { createSign } = await import('crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(key.private_key, 'base64url');
    const jwt = `${header}.${payload}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      console.error('[IAP] Google OAuth2 failed:', res.status, (await res.text()).slice(0, 200));
      return null;
    }

    const { access_token, expires_in } = await res.json() as any;
    _googleAccessToken = access_token;
    _googleTokenExpiry = Date.now() + Number(expires_in) * 1000;
    return access_token;
  } catch (err: any) {
    console.error('[IAP] getGoogleAccessToken error:', err.message);
    return null;
  }
}

// ─── Google Play verification ─────────────────────────────────────────────────

async function verifyGooglePlay(data: VerifyReceiptData): Promise<StoreVerifyResult> {
  const token = await getGoogleAccessToken();

  if (!token) {
    console.log('[IAP][DEV] No service key — accepting Google Play purchase:', data.productId);
    return {
      valid: true,
      orderId: `dev_${Date.now()}`,
      expiresAt: data.type === 'subscription'
        ? new Date(Date.now() + 30 * 86_400_000).toISOString()
        : undefined,
    };
  }

  const pkg = encodeURIComponent(data.packageName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    if (data.type === 'subscription') {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptionsv2/tokens/${encodeURIComponent(data.purchaseToken)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!res.ok) {
        console.error('[IAP] Google Play sub verify failed:', res.status, (await res.text()).slice(0, 200));
        return { valid: false };
      }
      const r: any = await res.json();
      const state: string = r.subscriptionState ?? '';
      const lineItem = r.lineItems?.[0];
      return {
        valid: state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        orderId: r.latestOrderId,
        expiresAt: lineItem?.expiryTime,
      };
    } else {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${encodeURIComponent(data.productId)}/tokens/${encodeURIComponent(data.purchaseToken)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!res.ok) {
        console.error('[IAP] Google Play product verify failed:', res.status);
        return { valid: false };
      }
      const r: any = await res.json();
      return { valid: r.purchaseState === 0, orderId: r.orderId };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Apple App Store verification ─────────────────────────────────────────────

async function verifyApple(data: VerifyReceiptData): Promise<StoreVerifyResult> {
  const sharedSecret = env.APPLE_SHARED_SECRET;

  if (!sharedSecret) {
    console.log('[IAP][DEV] No shared secret — accepting Apple purchase:', data.productId);
    return {
      valid: true,
      orderId: `dev_ios_${Date.now()}`,
      expiresAt: data.type === 'subscription'
        ? new Date(Date.now() + 30 * 86_400_000).toISOString()
        : undefined,
    };
  }

  const body = JSON.stringify({
    'receipt-data': data.purchaseToken,
    password: sharedSecret,
    'exclude-old-transactions': true,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  async function callApple(url: string): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Apple verifyReceipt HTTP ${res.status}`);
    return res.json();
  }

  try {
    // Production endpoint first; Apple returns 21007 if receipt is from sandbox
    const prodUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    const sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';

    let result = await callApple(env.NODE_ENV === 'production' ? prodUrl : sandboxUrl);

    if (result.status === 21007) {
      // Sandbox receipt submitted to production — retry with sandbox
      result = await callApple(sandboxUrl);
    }

    if (result.status !== 0) {
      console.error('[IAP] Apple receipt status:', result.status);
      return { valid: false };
    }

    if (data.type === 'subscription') {
      const receipts: any[] = result.latest_receipt_info ?? [];
      const matching = receipts
        .filter((r: any) => r.product_id === data.productId)
        .sort((a: any, b: any) => Number(b.expires_date_ms) - Number(a.expires_date_ms));

      if (!matching.length) return { valid: false };
      const latest = matching[0];
      const expiresMs = Number(latest.expires_date_ms);
      return {
        valid: expiresMs > Date.now(),
        orderId: latest.transaction_id,
        expiresAt: new Date(expiresMs).toISOString(),
      };
    } else {
      const inApp: any[] = result.receipt?.in_app ?? [];
      const match = inApp.find((r: any) => r.product_id === data.productId);
      return { valid: !!match, orderId: match?.transaction_id };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main public function ─────────────────────────────────────────────────────

export async function verifyReceipt(userId: string, data: VerifyReceiptData) {
  const verification = data.platform === 'ios'
    ? await verifyApple(data)
    : await verifyGooglePlay(data);

  if (!verification.valid) {
    return { valid: false, productId: data.productId };
  }

  // Record payment (ignore duplicate tokens)
  await db.insert(payments).values({
    userId,
    type: 'subscription',
    amount: '0',
    currency: 'USD',
    status: 'succeeded',
    iapToken: data.purchaseToken.slice(0, 2048),
    metadata: {
      source: data.platform === 'ios' ? 'app_store_iap' : 'google_play_iap',
      productId: data.productId,
      packageName: data.packageName,
      orderId: verification.orderId,
      platform: data.platform,
    },
  }).catch(() => {}); // Ignore duplicate-key violations

  // Activate / renew subscription
  if (data.type === 'subscription' && data.planId) {
    const [plan] = await db.select().from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.id, data.planId), eq(subscriptionPlans.isActive, true)))
      .limit(1);

    if (plan) {
      const periodEnd = verification.expiresAt
        ? new Date(verification.expiresAt)
        : new Date(Date.now() + (plan.period === 'yearly' ? 365 : 30) * 86_400_000);

      const [existing] = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .limit(1);

      if (existing) {
        await db.update(userSubscriptions).set({
          planId: data.planId,
          status: 'active',
          platform: data.platform,
          purchaseToken: data.purchaseToken.slice(0, 2048),
          orderId: verification.orderId,
          productId: data.productId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
          updatedAt: new Date(),
        }).where(eq(userSubscriptions.id, existing.id));
      } else {
        await db.insert(userSubscriptions).values({
          userId,
          planId: data.planId,
          status: 'active',
          platform: data.platform,
          purchaseToken: data.purchaseToken.slice(0, 2048),
          orderId: verification.orderId,
          productId: data.productId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        });
      }

      await sendNotification(userId, {
        type: 'system',
        title: '🎉 Subscription Active',
        body: `You're now on the ${plan.name} plan. All premium features unlocked!`,
        priority: 'high',
      }).catch(() => {});
    }
  }

  return {
    valid: true,
    productId: data.productId,
    orderId: verification.orderId,
    expiresAt: verification.expiresAt,
  };
}

/** Re-verify a stored purchase token to check if subscription is still active.
 *  Called by the subscription expiry job. */
export async function renewSubscription(subId: string): Promise<boolean> {
  const [sub] = await db.select({
    id: userSubscriptions.id,
    userId: userSubscriptions.userId,
    purchaseToken: userSubscriptions.purchaseToken,
    productId: userSubscriptions.productId,
    platform: userSubscriptions.platform,
    planId: userSubscriptions.planId,
  }).from(userSubscriptions).where(eq(userSubscriptions.id, subId)).limit(1);

  if (!sub?.purchaseToken || !sub.productId) return false;

  const result = sub.platform === 'ios'
    ? await verifyApple({
        purchaseToken: sub.purchaseToken,
        productId: sub.productId,
        packageName: env.APPLE_BUNDLE_ID || 'com.botttradeapp',
        platform: 'ios',
        type: 'subscription',
      })
    : await verifyGooglePlay({
        purchaseToken: sub.purchaseToken,
        productId: sub.productId,
        packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
        platform: 'android',
        type: 'subscription',
      });

  if (result.valid && result.expiresAt) {
    await db.update(userSubscriptions).set({
      status: 'active',
      currentPeriodEnd: new Date(result.expiresAt),
      updatedAt: new Date(),
    }).where(eq(userSubscriptions.id, subId));
    return true;
  }

  return false;
}
