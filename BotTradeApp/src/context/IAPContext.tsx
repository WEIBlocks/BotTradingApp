import React, {createContext, useContext, useEffect, useState, useCallback, useRef} from 'react';
import {Platform} from 'react-native';
import {useToast} from './ToastContext';
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

// ─── Provider ─────────────────────────────────────────────────────────────

export function IAPProvider({children}: {children: React.ReactNode}) {
  const {alert: showAlert} = useToast();
  const [state, setState] = useState<IAPState>({
    initialized: false,
    subscriptionProducts: [],
    botProducts: [],
    processing: false,
    activeSubscription: null,
  });

  const listenerCleanup = useRef<(() => void) | null>(null);

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

      // Resolve the backend plan ID from the store product ID
      let planId: string | undefined;
      if (isSub) {
        const plan = await subscriptionApi.getPlanByProductId(purchase.productId).catch(() => null);
        planId = plan?.id;
      }

      // Verify on backend
      await iapService.verifyReceipt({
        purchaseToken: token,
        productId: purchase.productId,
        packageName: 'com.botttradeapp',
        platform,
        type: isSub ? 'subscription' : 'bot_purchase',
        planId,
      });

      // Acknowledge the purchase
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

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Check Pro status from backend (authoritative source)
      const backendIsPro = await subscriptionApi.isPro().catch(() => false);

      const connected = await iapService.init();
      if (!mounted) return;

      // Set up listeners
      if (connected) {
        listenerCleanup.current = iapService.addPurchaseListeners(handlePurchase, handleError);
      }

      // Load subscription products (may fail in dev/simulator)
      const subs = connected ? await iapService.getSubscriptionProducts().catch(() => []) : [];

      // Check existing store purchases (restore)
      const existing = connected ? await iapService.restorePurchases().catch(() => []) : [];
      const activeSub = existing.find(p => SUB_SKUS.includes(p.productId));

      if (mounted) {
        setState(prev => ({
          ...prev,
          initialized: true,
          subscriptionProducts: subs,
          // Backend is authoritative — if backend says Pro, mark active
          activeSubscription: backendIsPro
            ? (activeSub?.productId || 'backend_pro')
            : (activeSub?.productId || null),
        }));
      }
    }

    init();

    return () => {
      mounted = false;
      listenerCleanup.current?.();
      iapService.destroy();
    };
  }, [handlePurchase, handleError]);

  // Purchase subscription
  const purchaseSubscription = useCallback(async (sku: string, offerToken?: string): Promise<boolean> => {
    if (state.processing) return false;
    setState(prev => ({...prev, processing: true}));

    try {
      const result = await iapService.purchaseSubscription(sku, offerToken);
      if (!result) {
        setState(prev => ({...prev, processing: false}));
        return false; // User cancelled
      }
      // Purchase listener will handle verification
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
    if (price === 0) return true; // Free bot — no IAP needed

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
      // Purchase listener handles verification
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

      // Verify each on backend
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
          }).catch(() => {}); // Non-blocking
        }
      }

      setState(prev => ({
        ...prev,
        processing: false,
        activeSubscription: activeSub?.productId || null,
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

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useIAP(): IAPContextValue {
  const ctx = useContext(IAPContext);
  if (!ctx) throw new Error('useIAP must be used within IAPProvider');
  return ctx;
}
