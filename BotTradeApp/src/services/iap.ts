import {Platform} from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  type ProductPurchase,
  type SubscriptionPurchase,
  type Product,
  type Subscription,
  type PurchaseError,
} from 'react-native-iap';
import {api} from './api';

// ─── Product IDs (must match Google Play Console / App Store Connect) ────────

/** Subscription product IDs — must match googleProductId / appleProductId in DB */
export const SUB_SKUS = Platform.select({
  android: ['bottrade_pro_monthly', 'bottrade_pro_yearly'],
  ios: ['com.botttradeapp.pro.monthly', 'com.botttradeapp.pro.yearly'],
  default: [],
}) as string[];

/** One-time bot purchase product IDs — dynamically built from bot price tiers */
export const BOT_PRODUCT_PREFIX = 'bot_tier_';

/** Standard bot price tiers (in USD) mapped to Google Play product IDs */
export const BOT_PRICE_TIERS: Record<number, string> = {
  0: 'bot_tier_free',
  5: 'bot_tier_5',
  10: 'bot_tier_10',
  15: 'bot_tier_15',
  20: 'bot_tier_20',
  25: 'bot_tier_25',
  30: 'bot_tier_30',
  50: 'bot_tier_50',
  100: 'bot_tier_100',
};

export function getBotProductId(price: number): string | null {
  if (price === 0) return null; // Free bots don't need IAP
  const tier = BOT_PRICE_TIERS[price];
  if (tier) return tier;
  // Find nearest tier
  const prices = Object.keys(BOT_PRICE_TIERS).map(Number).filter(p => p > 0).sort((a, b) => a - b);
  const nearest = prices.find(p => p >= price) || prices[prices.length - 1];
  return BOT_PRICE_TIERS[nearest] || null;
}

// ─── Types ────────────────────────────────────────────────────────────────

export type IAPProduct = Product;
export type IAPSubscription = Subscription;
export type IAPPurchase = ProductPurchase | SubscriptionPurchase;

export interface VerifyReceiptResponse {
  valid: boolean;
  expiresAt?: string;
  productId?: string;
  orderId?: string;
}

// ─── IAP Service ──────────────────────────────────────────────────────────

export const iapService = {
  /** Initialize IAP connection — call once on app start */
  async init(): Promise<boolean> {
    try {
      await initConnection();
      return true;
    } catch (err) {
      console.warn('[IAP] init failed:', err);
      return false;
    }
  },

  /** Clean up connection — call on app unmount */
  async destroy(): Promise<void> {
    try {
      await endConnection();
    } catch {
      // Ignore cleanup errors
    }
  },

  /** Get subscription products from store */
  async getSubscriptionProducts(): Promise<Subscription[]> {
    try {
      const subs = await getSubscriptions({skus: SUB_SKUS});
      return subs;
    } catch (err) {
      console.warn('[IAP] getSubscriptions failed:', err);
      return [];
    }
  },

  /** Get bot product (one-time purchase) from store */
  async getBotProducts(skus: string[]): Promise<Product[]> {
    try {
      const products = await getProducts({skus});
      return products;
    } catch (err) {
      console.warn('[IAP] getProducts failed:', err);
      return [];
    }
  },

  /** Purchase a subscription */
  async purchaseSubscription(sku: string, offerToken?: string): Promise<SubscriptionPurchase | null> {
    try {
      const purchase = await requestSubscription({
        sku,
        ...(offerToken && Platform.OS === 'android' ? {subscriptionOffers: [{sku, offerToken}]} : {}),
      });
      return purchase as SubscriptionPurchase;
    } catch (err) {
      const error = err as PurchaseError;
      if (error.code === 'E_USER_CANCELLED') return null;
      throw err;
    }
  },

  /** Purchase a one-time product (bot) */
  async purchaseProduct(sku: string): Promise<ProductPurchase | null> {
    try {
      const purchase = await requestPurchase({skus: [sku]});
      return purchase as ProductPurchase;
    } catch (err) {
      const error = err as PurchaseError;
      if (error.code === 'E_USER_CANCELLED') return null;
      throw err;
    }
  },

  /** Acknowledge/finish a purchase (required by Google Play) */
  async finishPurchase(purchase: ProductPurchase | SubscriptionPurchase, isConsumable = false): Promise<void> {
    await finishTransaction({purchase, isConsumable});
  },

  /** Get previously purchased items (restore purchases) */
  async restorePurchases(): Promise<(ProductPurchase | SubscriptionPurchase)[]> {
    try {
      const purchases = await getAvailablePurchases();
      return purchases;
    } catch (err) {
      console.warn('[IAP] restorePurchases failed:', err);
      return [];
    }
  },

  /** Verify receipt on our backend */
  async verifyReceipt(data: {
    purchaseToken: string;
    productId: string;
    packageName: string;
    platform: 'android' | 'ios';
    type: 'subscription' | 'bot_purchase';
    planId?: string;
  }): Promise<VerifyReceiptResponse> {
    const res = await api.post<{data: VerifyReceiptResponse}>('/payments/iap/verify', data as Record<string, unknown>);
    return res.data;
  },

  /** Register purchase event listeners */
  addPurchaseListeners(
    onPurchase: (purchase: ProductPurchase | SubscriptionPurchase) => void,
    onError: (error: PurchaseError) => void,
  ) {
    const purchaseSub = purchaseUpdatedListener(onPurchase);
    const errorSub = purchaseErrorListener(onError);
    return () => {
      purchaseSub.remove();
      errorSub.remove();
    };
  },
};
