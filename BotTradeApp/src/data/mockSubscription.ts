import {SubscriptionPlan, PaymentMethodData} from '../types';

export const mockSubscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'monthly',
    features: [
      'Access to marketplace',
      'Paper trading',
      'Shadow mode (1 bot)',
      'Basic notifications',
    ],
  },
  {
    id: 'pro',
    name: 'TradingApp Pro',
    price: 4.94,
    period: 'monthly',
    features: [
      'Trading Rooms (community)',
      'Live feed of all trades',
      '3% discount on bot profits',
      'Priority support',
      'Unlimited shadow mode bots',
      'Advanced analytics',
      'Creator Studio access',
    ],
  },
];

export const mockPaymentMethods: PaymentMethodData[] = [
  {
    id: 'pm1',
    type: 'card',
    label: 'Visa',
    last4: '4242',
    network: 'Visa',
    isDefault: true,
  },
  {
    id: 'pm2',
    type: 'crypto',
    label: 'USDT Wallet',
    last4: '0x...4f2a',
    isDefault: false,
  },
];
