export declare function getPlans(): Promise<{
    id: string;
    name: string;
    tier: "free" | "pro" | null;
    googleProductId: string | null;
    appleProductId: string | null;
    price: string;
    period: "monthly" | "yearly" | null;
    features: string[] | null;
    discountPercent: string | null;
    isActive: boolean | null;
    createdAt: Date | null;
}[]>;
export declare function getCurrentSubscription(userId: string): Promise<{
    id: string;
    userId: string;
    planId: string;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    platform: "android" | "ios" | "none" | null;
    productId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
    createdAt: Date | null;
    planName: string;
    planPrice: string;
    planPeriod: "monthly" | "yearly" | null;
    planFeatures: string[] | null;
    tier: "free" | "pro" | null;
    googleProductId: string | null;
    appleProductId: string | null;
}>;
/** Returns whether user currently has an active Pro subscription */
export declare function isUserPro(userId: string): Promise<boolean>;
/**
 * Called AFTER successful IAP verification by iap.service.ts.
 * Idempotent — safe to call on renewal.
 */
export declare function subscribe(userId: string, planId: string): Promise<{
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    id: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    userId: string;
    planId: string;
    platform: "android" | "ios" | "none" | null;
    purchaseToken: string | null;
    orderId: string | null;
    productId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
}>;
export declare function cancel(userId: string): Promise<{
    id: string;
    userId: string;
    planId: string;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    platform: "android" | "ios" | "none" | null;
    purchaseToken: string | null;
    orderId: string | null;
    productId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
