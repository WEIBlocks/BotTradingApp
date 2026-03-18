import {api} from './api';
import type {PaymentMethodData, SubscriptionPlan} from '../types';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface PaymentMethodRow {
  id: string;
  type: string;
  label: string | null;
  last4: string | null;
  network: string | null;
  cryptoAddress: string | null;
  createdAt: string;
}

interface DataWrap<T> { data: T }

// ─── Transform ──────────────────────────────────────────────────────────────

function mapPaymentMethod(p: PaymentMethodRow, index: number): PaymentMethodData {
  return {
    id: p.id ?? '',
    type: (p.type === 'card' ? 'card' : 'crypto') as PaymentMethodData['type'],
    label: p.label ?? (p.type === 'card' ? 'Card' : 'Crypto Wallet'),
    last4: p.last4 ?? (p.cryptoAddress ? `${p.cryptoAddress.slice(0, 4)}...${p.cryptoAddress.slice(-4)}` : undefined),
    network: p.network ?? undefined,
    isDefault: index === 0,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

export const paymentsApi = {
  /** Get user's saved payment methods. */
  async getMethods(): Promise<PaymentMethodData[]> {
    const res = await api.get<DataWrap<PaymentMethodRow[]>>('/user/payment-methods');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapPaymentMethod);
  },

  /** Add a new payment method. */
  async addMethod(data: {type: string; label?: string; last4?: string; network?: string; cryptoAddress?: string}) {
    return api.post<DataWrap<PaymentMethodRow>>('/user/payment-methods', data as Record<string, unknown>);
  },

  /** Delete a payment method. */
  async deleteMethod(methodId: string) {
    return api.delete(`/user/payment-methods/${methodId}`);
  },

  /** Get subscription plans. */
  async getPlans(): Promise<SubscriptionPlan[]> {
    const res = await api.get<DataWrap<any[]>>('/subscription/plans', {auth: false});
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(p => ({
      id: p.id ?? '',
      name: p.name ?? '',
      price: Number(p.price ?? p.priceMonthly) || 0,
      period: (p.period ?? 'monthly') as SubscriptionPlan['period'],
      features: Array.isArray(p.features) ? p.features : [],
      discount: p.discount ? Number(p.discount) : undefined,
    }));
  },

  /** Confirm checkout (legacy — used as fallback). */
  async confirmCheckout(data: {paymentMethodId: string; type: string; itemId?: string; amount: number}) {
    return api.post('/user/payment-methods/checkout/confirm', data as Record<string, unknown>);
  },
};
