import {UserProfile} from '../types';
import {mockTrades} from './mockTrades';

export const mockUser: UserProfile = {
  id: 'user1',
  name: 'Alex Trader',
  email: 'alex@example.com',
  avatarInitials: 'AT',
  avatarColor: '#10B981',
  riskTolerance: 60,
  investmentGoal: 'Wealth',
  connectedBrokerage: 'Alpaca',
  referralCode: 'TRADER-X92F',
  totalBalance: 24830.42,
  accountBalance: 12450.00,
  buyingPower: 8200.00,
  totalProfit: 4830.42,
  totalProfitPercent: 6.35,
  activeBots: [
    {
      id: 'bot1', name: 'Trend Follower v2', pair: 'BTC/USDT',
      avatarColor: '#10B981', avatarLetter: 'T',
      dailyReturn: 1.24, totalReturn: 42.4, status: 'live', allocatedAmount: 5000,
    },
    {
      id: 'bot2', name: 'ETH Scalper Max', pair: 'ETH/USDT',
      avatarColor: '#A855F7', avatarLetter: 'E',
      dailyReturn: 0.38, totalReturn: 28.7, status: 'live', allocatedAmount: 4200,
    },
    {
      id: 'bot3', name: 'SOL Arbitrage', pair: 'SOL/USDT',
      avatarColor: '#0D7FF2', avatarLetter: 'S',
      dailyReturn: -0.12, totalReturn: 18.3, status: 'paper', allocatedAmount: 3250,
    },
  ],
  recentActivity: [
    {
      id: 'a1', type: 'profit', title: 'Bot Profit',
      subtitle: 'Trend Follower v2', amount: 342.12,
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: 'a2', type: 'purchase', title: 'Bot Purchase',
      subtitle: 'ETH Scalper Max • $15/mo', amount: -15.00,
      timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    },
    {
      id: 'a3', type: 'deposit', title: 'Deposit',
      subtitle: 'Bank Transfer', amount: 2500.00,
      timestamp: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    },
  ],
};
