import {ExchangeConnection, ExchangeAsset} from '../types';

export const mockExchangeConnections: ExchangeConnection[] = [
  {
    id: 'exc1',
    provider: 'Coinbase',
    method: 'oauth',
    status: 'connected',
    lastSync: '2 min ago',
    accountLabel: 'Main Trading',
    totalBalance: 18420.50,
  },
  {
    id: 'exc2',
    provider: 'Binance',
    method: 'api_key',
    status: 'connected',
    lastSync: '5 min ago',
    accountLabel: 'Spot Account',
    totalBalance: 6409.92,
  },
];

export const mockExchangeAssets: ExchangeAsset[] = [
  {symbol: 'BTC', name: 'Bitcoin', amount: 0.42, valueUsd: 14280.00, change24h: 2.4, allocation: 57.5, iconColor: '#F7931A'},
  {symbol: 'ETH', name: 'Ethereum', amount: 3.2, valueUsd: 5760.00, change24h: -1.1, allocation: 23.2, iconColor: '#627EEA'},
  {symbol: 'SOL', name: 'Solana', amount: 28.5, valueUsd: 2565.00, change24h: 5.3, allocation: 10.3, iconColor: '#9945FF'},
  {symbol: 'USDT', name: 'Tether', amount: 1250.00, valueUsd: 1250.00, change24h: 0.0, allocation: 5.0, iconColor: '#26A17B'},
  {symbol: 'BNB', name: 'BNB', amount: 2.8, valueUsd: 672.00, change24h: 1.8, allocation: 2.7, iconColor: '#F3BA2F'},
  {symbol: 'MATIC', name: 'Polygon', amount: 450.0, valueUsd: 303.42, change24h: -0.6, allocation: 1.3, iconColor: '#8247E5'},
];
