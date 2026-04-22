import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface WalletExchange {
  provider: string;
  assetClass: 'crypto' | 'stocks';
  totalBalance: string;
  allocatedCapital: string;
  buyingPower: string;
  sandbox: boolean;
  status: string;
}

interface WalletResponse {
  user: { id: string; email: string; displayName: string };
  totalBalance: string;
  allocatedCapital?: string;
  buyingPower?: string;
  exchanges?: WalletExchange[];
  recentActivity: Array<{
    id: string; type: string; amount: string; description: string; createdAt: string;
  }>;
}

interface PortfolioSummaryResponse {
  totalValue: string;
  change24h: string;
  change24hPercent: string;
}

// Backend returns flat rows from getUserActiveBots (no nested bot object)
interface ActiveBotRow {
  subscriptionId: string;
  subscriptionStatus: string;
  subscriptionMode: string;
  allocatedAmount: string | null;
  minOrderValue: string | null;
  shadowMinOrderValue: number | null;
  startedAt: string;
  botId: string;
  botName: string;
  botSubtitle: string;
  botStrategy: string;
  botCategory: string;
  botRiskLevel: string;
  botAvatarColor: string;
  botAvatarLetter: string;
  return30d: number | null;
  winRate: number | null;
  activeUsers: number | null;
  avgRating: number | null;
  shadowReturn30d?: number | null;
  hasShadow?: boolean;
}

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface ExchangePower {
  provider: string;
  assetClass: 'crypto' | 'stocks';
  totalBalance: number;
  allocatedCapital: number;
  buyingPower: number;
  sandbox: boolean;
  status: string;
}

export interface DashboardSummary {
  totalBalance: number;
  totalProfitPercent: number;
  totalProfit: number;
  accountBalance: number;
  buyingPower: number;
  exchanges: ExchangePower[];
}

export interface ActiveBot {
  id: string;
  subscriptionId: string;
  name: string;
  pair: string;
  avatarColor: string;
  avatarLetter: string;
  status: string;        // subscription mode: 'live' | 'paper'
  subStatus: string;     // subscription status: 'active' | 'shadow' | 'paused' | 'stopped'
  totalReturn: number;
  shadowReturn: number;
  hasShadow: boolean;
  minOrderValue: number;        // live subscription min order
  shadowMinOrderValue: number;  // shadow session min order
}

export interface RecentTrade {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

// Backend wraps responses in { data: T }
interface DataWrap<T> { data: T }

export const dashboardApi = {
  /**
   * Combines wallet + portfolio summary into a single dashboard snapshot.
   */
  async getSummary(): Promise<DashboardSummary> {
    // wallet endpoint returns object directly, portfolio wraps in { data: ... }
    const [wallet, portfolioRes] = await Promise.all([
      api.get<WalletResponse>('/user/wallet'),
      api.get<DataWrap<PortfolioSummaryResponse>>('/portfolio/summary').catch(() => null),
    ]);

    const totalBalance = parseFloat(wallet?.totalBalance ?? '0') || 0;
    const portfolio = portfolioRes?.data;
    const profitValue = parseFloat(portfolio?.change24h ?? '0') || 0;
    const profitPercent = parseFloat(portfolio?.change24hPercent ?? '0') || 0;

    // Use server-computed buyingPower (total balance minus capital locked in active live bots)
    // Falls back to totalBalance if backend hasn't returned it yet
    const buyingPower = parseFloat(wallet?.buyingPower ?? String(totalBalance)) || totalBalance;

    const exchanges: ExchangePower[] = (wallet?.exchanges ?? []).map(e => ({
      provider: e.provider,
      assetClass: e.assetClass,
      totalBalance: parseFloat(e.totalBalance) || 0,
      allocatedCapital: parseFloat(e.allocatedCapital) || 0,
      buyingPower: parseFloat(e.buyingPower) || 0,
      sandbox: e.sandbox,
      status: e.status,
    }));

    return {
      totalBalance,
      totalProfitPercent: profitPercent,
      totalProfit: profitValue,
      accountBalance: totalBalance,
      buyingPower,
      exchanges,
    };
  },

  /**
   * Returns the user's active bot subscriptions normalised for the dashboard.
   */
  async getActiveBots(): Promise<ActiveBot[]> {
    const res = await api.get<DataWrap<ActiveBotRow[]>>('/bots/user/active');
    const rows = Array.isArray(res?.data) ? res.data : [];

    return rows.map(row => ({
      id: row.botId ?? '',
      subscriptionId: row.subscriptionId ?? '',
      name: row.botName ?? 'Unknown Bot',
      pair: `${row.botCategory ?? 'Crypto'}`,
      avatarColor: row.botAvatarColor ?? '#6C63FF',
      avatarLetter: row.botAvatarLetter ?? (row.botName?.[0] ?? 'B'),
      status: row.subscriptionMode ?? 'paper',
      subStatus: row.subscriptionStatus ?? 'active',
      totalReturn: Number(row.return30d) || 0,
      shadowReturn: Number(row.shadowReturn30d) || 0,
      hasShadow: Boolean(row.hasShadow),
      minOrderValue: parseFloat(row.minOrderValue ?? '10') || 10,
      shadowMinOrderValue: Number(row.shadowMinOrderValue) || 10,
    }));
  },

  /**
   * Fetches recent trades from the backend.
   */
  async getRecentTrades(): Promise<any[]> {
    try {
      const res = await api.get<any[]>('/trades/recent?limit=5');
      return (res as any)?.data ?? res ?? [];
    } catch {
      return [];
    }
  },

  /** Get equity history for chart. */
  async getEquityHistory(days = 30): Promise<number[]> {
    try {
      const res = await api.get<DataWrap<{equityData: number[]; days: number}>>(`/portfolio/equity-history?days=${days}`);
      return Array.isArray(res?.data?.equityData) ? res.data.equityData : [];
    } catch {
      return [];
    }
  },

  async getEquityHistoryFull(days = 30, granularity: 'hourly' | 'daily' = 'daily'): Promise<{
    equityPoints: Array<{time: number; value: number}>;
    isRealData: boolean;
  }> {
    try {
      const res = await api.get<DataWrap<any>>(`/portfolio/equity-history?days=${days}&granularity=${granularity}`);
      const d = res?.data;
      console.log('[dashboardApi] equity raw keys:', Object.keys(res ?? {}), 'data keys:', Object.keys(d ?? {}), 'equityData len:', d?.equityData?.length, 'isRealData:', d?.isRealData);
      const values: number[]  = Array.isArray(d?.equityData) ? d.equityData : [];
      const dates: any[]      = Array.isArray(d?.dates) ? d.dates : [];

      // Zip values + dates into {time (unix seconds), value} pairs
      const equityPoints = values.map((v: number, i: number) => {
        const raw = dates[i];
        const ms  = raw ? new Date(raw).getTime() : Date.now();
        return {time: Math.floor(ms / 1000), value: v};
      }).filter(p => p.value > 0 && p.time > 0);

      return {
        equityPoints,
        isRealData: Boolean(d?.isRealData),
      };
    } catch {
      return {equityPoints: [], isRealData: false};
    }
  },
};
