import {CreatorStats, BotVersion} from '../types';

export const mockCreatorStats: CreatorStats = {
  totalRevenue: 4820.50,
  monthlyRevenue: 892.30,
  totalUsers: 342,
  avgRating: 4.6,
  reviewCount: 124,
  churnRate: 3.2,
};

export const mockBotVersions: BotVersion[] = [
  {id: 'v1', version: 'v2.1.0', isActive: true, users: 218, returnPercent: 23.1, createdAt: '2025-12-15'},
  {id: 'v2', version: 'v2.0.3', isActive: false, users: 89, returnPercent: 18.7, createdAt: '2025-10-20'},
  {id: 'v3', version: 'v1.9.0', isActive: false, users: 35, returnPercent: 14.2, createdAt: '2025-08-05'},
];

export const mockCreatorBots = [
  {id: 'cb1', name: 'Momentum Alpha', users: 218, rating: 4.8, returnPercent: 23.1, revenue: 3240.00},
  {id: 'cb2', name: 'Grid Master Pro', users: 89, rating: 4.3, returnPercent: 12.5, revenue: 1120.50},
  {id: 'cb3', name: 'DCA Accumulator', users: 35, rating: 4.5, returnPercent: 8.7, revenue: 460.00},
];

export const mockAiSuggestions = [
  'Reduce max drawdown by adding trailing stop-loss to Momentum Alpha',
  'Your Grid Master Pro performs better in low-volatility — consider pausing during high-VIX periods',
  'Users who churn cite "slow execution" — optimize order latency',
];
