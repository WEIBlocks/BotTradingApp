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
export declare function verifyReceipt(userId: string, data: VerifyReceiptData): Promise<{
    valid: boolean;
    productId: string;
    orderId?: undefined;
    expiresAt?: undefined;
} | {
    valid: boolean;
    productId: string;
    orderId: string | undefined;
    expiresAt: string | undefined;
}>;
/** Re-verify a stored purchase token to check if subscription is still active.
 *  Called by the subscription expiry job. */
export declare function renewSubscription(subId: string): Promise<boolean>;
