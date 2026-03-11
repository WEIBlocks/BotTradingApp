import {LiveTrade} from '../types';

const now = Date.now();

export const mockLiveTrades: LiveTrade[] = [
  {id: 'lt1', symbol: 'BTC/USDT', side: 'BUY', amount: 0.05, price: 64210.50, timestamp: new Date(now - 120000), botId: 'bot1', botName: 'Momentum Alpha', pnl: undefined, pnlPercent: undefined, isLive: true, reasoning: 'RSI hit oversold at 28. Breakout confirmed on 15m chart.'},
  {id: 'lt2', symbol: 'ETH/USDT', side: 'SELL', amount: 1.2, price: 1802.30, timestamp: new Date(now - 300000), botId: 'bot2', botName: 'ETH Scalper Max', pnl: 42.80, pnlPercent: 2.1, isLive: true},
  {id: 'lt3', symbol: 'SOL/USDT', side: 'BUY', amount: 15.0, price: 89.45, timestamp: new Date(now - 600000), botId: 'bot3', botName: 'SOL Arbitrage', pnl: undefined, pnlPercent: undefined, isLive: true, reasoning: 'Cross-exchange spread detected: 0.8% Binance vs Coinbase.'},
  {id: 'lt4', symbol: 'BTC/USDT', side: 'SELL', amount: 0.03, price: 64520.10, timestamp: new Date(now - 900000), botId: 'bot1', botName: 'Momentum Alpha', pnl: 89.20, pnlPercent: 4.2, isLive: true},
  {id: 'lt5', symbol: 'MATIC/USDT', side: 'BUY', amount: 500.0, price: 0.674, timestamp: new Date(now - 1800000), botId: 'bot4', botName: 'Grid Master', pnl: undefined, pnlPercent: undefined, isLive: true},
  {id: 'lt6', symbol: 'BNB/USDT', side: 'BUY', amount: 2.0, price: 240.15, timestamp: new Date(now - 3600000), botId: 'bot1', botName: 'Momentum Alpha', pnl: undefined, pnlPercent: undefined, isLive: false, reasoning: 'Golden cross on 4h chart. Volume surge detected.'},
  {id: 'lt7', symbol: 'ETH/USDT', side: 'BUY', amount: 0.8, price: 1785.40, timestamp: new Date(now - 5400000), botId: 'bot2', botName: 'ETH Scalper Max', pnl: undefined, pnlPercent: undefined, isLive: false},
  {id: 'lt8', symbol: 'SOL/USDT', side: 'SELL', amount: 10.0, price: 91.20, timestamp: new Date(now - 7200000), botId: 'bot3', botName: 'SOL Arbitrage', pnl: 17.50, pnlPercent: 1.9, isLive: false},
];
