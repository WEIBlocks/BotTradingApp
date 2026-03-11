import {Trade} from '../types';

export const mockTrades: Trade[] = [
  {
    id: 't1', symbol: 'BTC/USDT', side: 'BUY', amount: 0.0042, price: 43250,
    timestamp: new Date(Date.now() - 2 * 60 * 1000), botId: 'bot1', botName: 'Trend Follower v2',
    pnl: 85.40, pnlPercent: 1.58,
  },
  {
    id: 't2', symbol: 'ETH/USDT', side: 'SELL', amount: 1.20, price: 2285,
    timestamp: new Date(Date.now() - 15 * 60 * 1000), botId: 'bot2', botName: 'ETH Scalper Max',
    pnl: -22.10, pnlPercent: -0.65,
  },
  {
    id: 't3', symbol: 'SOL/USDT', side: 'BUY', amount: 12.55, price: 98.50,
    timestamp: new Date(Date.now() - 45 * 60 * 1000), botId: 'bot3', botName: 'SOL Arbitrage',
    pnl: 42.80, pnlPercent: 3.62,
  },
  {
    id: 't4', symbol: 'BTC/USDT', side: 'SELL', amount: 0.0070, price: 43100,
    timestamp: new Date(Date.now() - 3 * 3600 * 1000), botId: 'bot1', botName: 'Trend Follower v2',
    pnl: 128.50, pnlPercent: 3.72,
  },
  {
    id: 't5', symbol: 'MATIC/USDT', side: 'BUY', amount: 1500, price: 0.87,
    timestamp: new Date(Date.now() - 5 * 3600 * 1000), botId: 'bot4', botName: 'Manual Trade',
    pnl: 0.72, pnlPercent: 0.08,
  },
];
