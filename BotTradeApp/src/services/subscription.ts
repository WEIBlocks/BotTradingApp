import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanRow {
  id: string;
  name: string;
  priceMonthly: string;
  priceYearly: string | null;
  features: string[];
  tier: string;
}

interface SubRow {
  id: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: PlanRow;
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
    return items.map(p => ({
      id: p.id ?? '',
      name: p.name ?? '',
      tier: p.tier ?? 'free',
      priceMonthly: parseFloat(p.priceMonthly ?? '0') || 0,
      priceYearly: parseFloat(p.priceYearly ?? '0') || 0,
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
        planName: s.plan?.name ?? '',
        tier: s.plan?.tier ?? 'free',
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
};
