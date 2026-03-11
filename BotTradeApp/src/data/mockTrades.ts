import {Trade} from '../types';

export const mockTrades: Trade[] = [
  {
    id: 't1', symbol: 'BTC/USDT', side: 'BUY', amount: 0.125, price: 43250,
    timestamp: new Date(Date.now() - 2 * 60 * 1000), botId: 'bot1', botName: 'Trend Follower v2',
    pnl: 85.40, pnlPercent: 1.58,
  },
  {
    id: 't2', symbol: 'ETH/USDT', side: 'SELL', amount: 1.5, price: 2285,
    timestamp: new Date(Date.now() - 15 * 60 * 1000), botId: 'bot2', botName: 'ETH Scalper Max',
    pnl: -22.10, pnlPercent: -0.65,
  },
  {
    id: 't3', symbol: 'SOL/USDT', side: 'BUY', amount: 12, price: 98.50,
    timestamp: new Date(Date.now() - 45 * 60 * 1000), botId: 'bot3', botName: 'SOL Arbitrage',
    pnl: 42.80, pnlPercent: 3.62,
  },
  {
    id: 't4', symbol: 'BTC/USDT', side: 'SELL', amount: 0.08, price: 43100,
    timestamp: new Date(Date.now() - 2 * 3600 * 1000), botId: 'bot1', botName: 'Trend Follower v2',
    pnl: 128.50, pnlPercent: 3.72,
  },
  {
    id: 't5', symbol: 'MATIC/USDT', side: 'BUY', amount: 500, price: 0.87,
    timestamp: new Date(Date.now() - 5 * 3600 * 1000), botId: 'bot4', botName: 'Polygon Pro',
    pnl: 15.50, pnlPercent: 3.56,
  },
  {
    id: 't6', symbol: 'ETH/USDT', side: 'BUY', amount: 2.0, price: 2260,
    timestamp: new Date(Date.now() - 8 * 3600 * 1000), botId: 'bot2', botName: 'ETH Scalper Max',
    pnl: 50.00, pnlPercent: 1.11,
  },
];
