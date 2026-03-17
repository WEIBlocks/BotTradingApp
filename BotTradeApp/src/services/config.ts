import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformConfig {
  platformFeeRate: number;
  proDiscountRate: number;
  tradingPairs: string[];
  strategies: string[];
  riskLevels: string[];
  categories: string[];
}

interface DataWrap<T> { data: T }

// ─── Cache ──────────────────────────────────────────────────────────────────

let cachedConfig: PlatformConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Service ────────────────────────────────────────────────────────────────

export const configApi = {
  /** Get platform config (cached for 5 min). */
  async getPlatformConfig(): Promise<PlatformConfig> {
    if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) {
      return cachedConfig;
    }
    try {
      const res = await api.get<DataWrap<PlatformConfig>>('/config/platform', {auth: false});
      cachedConfig = res?.data ?? null;
      cacheTime = Date.now();
      return cachedConfig!;
    } catch {
      // Fallback defaults
      return {
        platformFeeRate: 0.07,
        proDiscountRate: 0.03,
        tradingPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'MATIC/USDT'],
        strategies: ['Trend Following', 'Scalping', 'Grid', 'Arbitrage', 'DCA'],
        riskLevels: ['Very Low', 'Low', 'Med', 'High', 'Very High'],
        categories: ['All', 'Crypto', 'Stocks', 'Top Performers'],
      };
    }
  },
};
