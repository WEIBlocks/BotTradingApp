import {Notification} from '../types';

export const mockNotifications: Notification[] = [
  {
    id: 'n1', type: 'alert', title: 'HIGH SIGNAL: BTC Breakout',
    body: 'Trend Follower v2 identified a bullish breakout pattern on BTC/USDT. Signal strength: 94%. Recommended action: Increase position size by 20%.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000), read: false, priority: 'high',
    chartData: [100, 102, 101, 104, 103, 106, 105, 108, 110, 112],
  },
  {
    id: 'n2', type: 'system', title: 'System Update v2.4.1',
    body: 'New features added: Enhanced backtesting engine, improved risk controls, and shadow mode analytics.',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000), read: false, priority: 'normal',
  },
  {
    id: 'n3', type: 'alert', title: 'Margin Alert: ETH Scalper Max',
    body: 'ETH Scalper Max has reached 80% of allocated capital. Consider adding funds or reducing position size.',
    timestamp: new Date(Date.now() - 4 * 3600 * 1000), read: true, priority: 'high',
  },
  {
    id: 'n4', type: 'trade', title: 'Profit Alert: SOL Arbitrage',
    body: 'SOL Arbitrage completed a successful round-trip: +$42.80 (+3.62%) on SOL/USDT. Win #47 this month.',
    timestamp: new Date(Date.now() - 6 * 3600 * 1000), read: true, priority: 'normal',
    chartData: [98, 99, 100, 101, 100, 102, 103, 104, 103, 105],
  },
  {
    id: 'n5', type: 'trade', title: 'Trade Executed: BTC/USDT',
    body: 'Trend Follower v2 opened a BUY position: 0.125 BTC at $43,250. Stop loss: $42,800.',
    timestamp: new Date(Date.now() - 8 * 3600 * 1000), read: true, priority: 'low',
  },
];
