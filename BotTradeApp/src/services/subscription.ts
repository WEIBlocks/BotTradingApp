import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Backend plan row (from getPlans — returns all columns) */
interface PlanRow {
  id: string;
  name: string;
  tier: string;
  price: string;
  period: string;
  features: string[];
  googleProductId?: string;
  appleProductId?: string;
  discountPercent?: string;
}

/** Backend subscription row (from getCurrentSubscription — flat JOIN result) */
interface SubRow {
  id: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  // Joined plan fields (flat, not nested under .plan)
  planName?: string;
  planPrice?: string;
  planPeriod?: string;
  planFeatures?: string[];
  tier?: string;
  // Fallback: nested plan object (some endpoints may wrap it)
  plan?: PlanRow;
}

interface DataWrap<T> { data: T }

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface SubPlan {
  id: string;
  name: string;
  tier: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
}

export interface CurrentSubscription {
  id: string;
  planId: string;
  planName: string;
  tier: string;
  status: string;
  currentPeriodEnd: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const subscriptionApi = {
  /** Get available subscription plans. */
  async getPlans(): Promise<SubPlan[]> {
    const res = await api.get<DataWrap<PlanRow[]>>('/subscription/plans', {auth: false});
    const items = Array.isArray(res?.data) ? res.data : [];

    // Group monthly/yearly for the same tier
    const monthly = items.find(p => p.tier === 'pro' && p.period === 'monthly');
    const yearly = items.find(p => p.tier === 'pro' && p.period === 'yearly');

    return items.map(p => ({
      id: p.id ?? '',
      name: p.name ?? '',
      tier: p.tier ?? 'free',
      priceMonthly: p.period === 'monthly' ? parseFloat(p.price ?? '0') || 0 : (monthly ? parseFloat(monthly.price) : 0),
      priceYearly: p.period === 'yearly' ? parseFloat(p.price ?? '0') || 0 : (yearly ? parseFloat(yearly.price) : 0),
      features: Array.isArray(p.features) ? p.features : [],
    }));
  },

  /** Get current user subscription. */
  async getCurrent(): Promise<CurrentSubscription | null> {
    try {
      const res = await api.get<DataWrap<SubRow | null>>('/subscription/current');
      const s = res?.data;
      if (!s) return null;
      return {
        id: s.id,
        planId: s.planId,
        // Support both flat JOIN result and nested plan object
        planName: s.planName ?? s.plan?.name ?? '',
        tier: s.tier ?? s.plan?.tier ?? 'free',
        status: s.status ?? 'inactive',
        currentPeriodEnd: s.currentPeriodEnd ?? '',
      };
    } catch {
      return null;
    }
  },

  /** Subscribe to a plan. */
  async subscribe(planId: string) {
    return api.post<DataWrap<SubRow>>('/subscription/subscribe', {planId} as Record<string, unknown>);
  },

  /** Cancel subscription. */
  async cancel() {
    return api.post('/subscription/cancel');
  },

  /** Lightweight Pro check — returns true if user has active Pro subscription. */
  async isPro(): Promise<boolean> {
    try {
      const res = await api.get<{data: {isPro: boolean}}>('/subscription/is-pro');
      return res?.data?.isPro === true;
    } catch {
      return false;
    }
  },

  /** Get plan by Google Play / App Store product ID. */
  async getPlanByProductId(productId: string): Promise<{id: string} | null> {
    try {
      const res = await api.get<{data: PlanRow[]}>('/subscription/plans', {auth: false});
      const plans = Array.isArray(res?.data) ? res.data : [];
      const match = plans.find(p => p.googleProductId === productId || p.appleProductId === productId);
      return match ? {id: match.id} : null;
    } catch {
      return null;
    }
  },
};
