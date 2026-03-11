import {PortfolioSummary} from '../types';
import {mockExchangeAssets} from './mockExchanges';

export const mockPortfolioSummary: PortfolioSummary = {
  totalValue: 24830.42,
  totalChange24h: 342.12,
  totalChangePercent24h: 1.4,
  assets: mockExchangeAssets,
  allocationBreakdown: [
    {label: 'BTC', percent: 57.5, color: '#F7931A'},
    {label: 'ETH', percent: 23.2, color: '#627EEA'},
    {label: 'SOL', percent: 10.3, color: '#9945FF'},
    {label: 'USDT', percent: 5.0, color: '#26A17B'},
    {label: 'Other', percent: 4.0, color: '#6B7280'},
  ],
};
