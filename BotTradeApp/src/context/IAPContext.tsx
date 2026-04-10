import React, {createContext, useContext, useEffect, useState, useCallback, useRef} from 'react';
import {Platform} from 'react-native';
import {useToast} from './ToastContext';
import {useAuth} from './AuthContext';
import {
  type ProductPurchase,
  type SubscriptionPurchase,
  type Product,
  type Subscription,
  type PurchaseError,
} from 'react-native-iap';
import {iapService, SUB_SKUS, getBotProductId} from '../services/iap';
import {subscriptionApi} from '../services/subscription';

// ─── Types ────────────────────────────────────────────────────────────────

interface IAPState {
  initialized: boolean;
  subscriptionProducts: Subscription[];
  botProducts: Product[];
  processing: boolean;
  activeSubscription: string | null; // active sub product ID
}

interface IAPContextValue extends IAPState {
  /** Purchase a Pro subscription */
  purchaseSubscription: (sku: string, offerToken?: string) => Promise<boolean>;
  /** Purchase a bot (one-time) */
  purchaseBot: (botId: string, price: number) => Promise<boolean>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<void>;
  /** Check if user has active Pro sub */
  isPro: boolean;
  /** Load bot products for specific SKUs */
  loadBotProducts: (skus: string[]) => Promise<void>;
}

const IAPContext = createContext<IAPContextValue | null>(null);

// ─── Inner provider (uses useAuth, so must be inside AuthProvider) ─────────

function IAPProviderInner({children}: {children: React.ReactNode}) {
  const {alert: showAlert} = useToast();
  const {user, isAuthReady} = useAuth();

  const [state, setState] = useState<IAPState>({
    initialized: false,
    subscriptionProducts: [],
    botProducts: [],
    processing: false,
    activeSubscription: null,
  });

  const listenerCleanup = useRef<(() => void) | null>(null);
  // Track which userId we last checked so we re-run on login/logout
  const lastCheckedUserId = useRef<string | null>(undefined as any);

  // Handle completed purchase
  const handlePurchase = useCallback(async (purchase: ProductPurchase | SubscriptionPurchase) => {
    try {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const token = platform === 'android'
        ? (purchase as any).purchaseToken
        : (purchase as any).transactionReceipt;

      if (!token) {
        console.warn('[IAP] No purchase token found');
        return;
      }

      const isSub = SUB_SKUS.includes(purchase.productId);

      let planId: string | undefined;
      if (isSub) {
        const plan = await subscriptionApi.getPlanByProductId(purchase.productId).catch(() => null);
        planId = plan?.id;
      }

      await iapService.verifyReceipt({
        purchaseToken: token,
        productId: purchase.productId,
        packageName: 'com.botttradeapp',
        platform,
        type: isSub ? 'subscription' : 'bot_purchase',
        planId,
      });

      await iapService.finishPurchase(purchase, !isSub);

      if (isSub) {
        setState(prev => ({...prev, activeSubscription: purchase.productId}));
      }

      setState(prev => ({...prev, processing: false}));
    } catch (err) {
      console.error('[IAP] Purchase verification failed:', err);
      setState(prev => ({...prev, processing: false}));
      showAlert('Purchase Error', 'Payment was received but verification failed. Please contact support.');
    }
  }, []);

  // Handle purchase error
  const handleError = useCallback((error: PurchaseError) => {
    setState(prev => ({...prev, processing: false}));
    if (error.code === 'E_USER_CANCELLED') return;
    console.warn('[IAP] Purchase error:', error);
    showAlert('Purchase Failed', error.message || 'Could not complete purchase. Please try again.');
  }, []);

  // Re-check pro status whenever the logged-in user changes (login, logout, session restore)
  useEffect(() => {
    // Wait until auth has finished its initial session check
    if (!isAuthReady) return;

    const currentUserId = user?.id ?? null;

    // Skip if we already checked for this user
    if (lastCheckedUserId.current === currentUserId) return;
    lastCheckedUserId.current = currentUserId;

    let mounted = true;

    // Reset to uninitialized while we check
    setState(prev => ({...prev, initialized: false, activeSubscription: null}));

    async function init() {
      // If no user, mark initialized with no subscription
      if (!currentUserId) {
        if (mounted) {
          setState(prev => ({...prev, initialized: true, activeSubscription: null}));
        }
        return;
      }

      try {
        // Backend is the authoritative source — check it first (token is now ready because isAuthReady=true)
        const backendIsPro = await subscriptionApi.isPro().catch(() => false);

        // If backend says pro, we can mark initialized immediately — no need to wait for IAP store
        // This prevents the flicker where a pro user sees the paywall while IAP store loads
        if (mounted && backendIsPro) {
          setState(prev => ({
            ...prev,
            initialized: true,
            activeSubscription: prev.activeSubscription || 'backend_pro',
          }));
        }

        // Also initialize the native IAP store (for purchases + local backup)
        const connected = await iapService.init();
        if (!mounted) return;

        if (connected && !listenerCleanup.current) {
          listenerCleanup.current = iapService.addPurchaseListeners(handlePurchase, handleError);
        }

        const subs = connected ? await iapService.getSubscriptionProducts().catch(() => []) : [];
        const existing = connected ? await iapService.restorePurchases().catch(() => []) : [];
        const activeSub = existing.find(p => SUB_SKUS.includes(p.productId));

        if (mounted) {
          setState(prev => ({
            ...prev,
            initialized: true,
            subscriptionProducts: subs,
            // Backend wins if true; fall back to local store; then null
            activeSubscription: backendIsPro
              ? (activeSub?.productId || prev.activeSubscription || 'backend_pro')
              : (activeSub?.productId || null),
          }));
        }
      } catch (err) {
        console.warn('[IAP] Init error:', err);
        if (mounted) {
          setState(prev => ({...prev, initialized: true}));
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [isAuthReady, user?.id, handlePurchase, handleError]);

  // Cleanup IAP store on unmount
  useEffect(() => {
    return () => {
      listenerCleanup.current?.();
      iapService.destroy();
    };
  }, []);

  // Purchase subscription
  const purchaseSubscription = useCallback(async (sku: string, offerToken?: string): Promise<boolean> => {
    if (state.processing) return false;
    setState(prev => ({...prev, processing: true}));

    try {
      const result = await iapService.purchaseSubscription(sku, offerToken);
      if (!result) {
        setState(prev => ({...prev, processing: false}));
        return false;
      }
      return true;
    } catch (err: any) {
      setState(prev => ({...prev, processing: false}));
      showAlert('Purchase Failed', err?.message || 'Could not complete purchase.');
      return false;
    }
  }, [state.processing]);

  // Purchase bot
  const purchaseBot = useCallback(async (botId: string, price: number): Promise<boolean> => {
    if (state.processing) return false;
    if (price === 0) return true;

    const productId = getBotProductId(price);
    if (!productId) {
      showAlert('Error', 'This bot price tier is not available for purchase.');
      return false;
    }

    setState(prev => ({...prev, processing: true}));

    try {
      const result = await iapService.purchaseProduct(productId);
      if (!result) {
        setState(prev => ({...prev, processing: false}));
        return false;
      }
      return true;
    } catch (err: any) {
      setState(prev => ({...prev, processing: false}));
      showAlert('Purchase Failed', err?.message || 'Could not complete purchase.');
      return false;
    }
  }, [state.processing]);

  // Restore purchases
  const restorePurchases = useCallback(async () => {
    setState(prev => ({...prev, processing: true}));
    try {
      const purchases = await iapService.restorePurchases();
      const activeSub = purchases.find(p => SUB_SKUS.includes(p.productId));

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      for (const purchase of purchases) {
        const token = platform === 'android'
          ? (purchase as any).purchaseToken
          : (purchase as any).transactionReceipt;
        if (token) {
          const isSub = SUB_SKUS.includes(purchase.productId);
          let planId: string | undefined;
          if (isSub) {
            const plan = await subscriptionApi.getPlanByProductId(purchase.productId).catch(() => null);
            planId = plan?.id;
          }
          await iapService.verifyReceipt({
            purchaseToken: token,
            productId: purchase.productId,
            packageName: 'com.botttradeapp',
            platform,
            type: isSub ? 'subscription' : 'bot_purchase',
            planId,
          }).catch(() => {});
        }
      }

      // Also re-check backend after restoring (in case a purchase was verified server-side)
      const backendIsPro = await subscriptionApi.isPro().catch(() => false);

      setState(prev => ({
        ...prev,
        processing: false,
        activeSubscription: backendIsPro
          ? (activeSub?.productId || 'backend_pro')
          : (activeSub?.productId || null),
      }));

      showAlert('Restore Complete', purchases.length > 0
        ? `Restored ${purchases.length} purchase(s).`
        : 'No previous purchases found.');
    } catch (err: any) {
      setState(prev => ({...prev, processing: false}));
      showAlert('Restore Failed', err?.message || 'Could not restore purchases.');
    }
  }, []);

  // Load bot products
  const loadBotProducts = useCallback(async (skus: string[]) => {
    const products = await iapService.getBotProducts(skus);
    setState(prev => ({...prev, botProducts: products}));
  }, []);

  const value: IAPContextValue = {
    ...state,
    purchaseSubscription,
    purchaseBot,
    restorePurchases,
    isPro: !!state.activeSubscription,
    loadBotProducts,
  };

  return <IAPContext.Provider value={value}>{children}</IAPContext.Provider>;
}

// ─── Public Provider (wraps inner to keep API identical) ──────────────────

export function IAPProvider({children}: {children: React.ReactNode}) {
  return <IAPProviderInner>{children}</IAPProviderInner>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useIAP(): IAPContextValue {
  const ctx = useContext(IAPContext);
  if (!ctx) throw new Error('useIAP must be used within IAPProvider');
  return ctx;
}
