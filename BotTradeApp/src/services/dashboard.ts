import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface WalletResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  totalBalance: string;
  recentActivity: Array<{
    id: string;
    type: string;
    amount: string;
    description: string;
    createdAt: string;
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
}

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface DashboardSummary {
  totalBalance: number;
  totalProfitPercent: number;
  totalProfit: number;
  accountBalance: number;
  buyingPower: number;
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

    const totalBalance = parseFloat(wallet?.totalBalance) || 0;
    const portfolio = portfolioRes?.data;
    const portfolioValue = parseFloat(portfolio?.totalValue ?? '0') || 0;
    const profitValue = parseFloat(portfolio?.change24h ?? '0') || 0;
    const profitPercent = parseFloat(portfolio?.change24hPercent ?? '0') || 0;

    return {
      totalBalance,
      totalProfitPercent: profitPercent,
      totalProfit: profitValue,
      accountBalance: totalBalance,
      buyingPower: totalBalance - portfolioValue > 0 ? totalBalance - portfolioValue : 0,
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

  async getEquityHistoryFull(days = 30): Promise<{equityData: number[]; dates: (string | Date)[]; isRealData: boolean}> {
    try {
      const res = await api.get<DataWrap<any>>(`/portfolio/equity-history?days=${days}`);
      const d = res?.data;
      return {
        equityData: Array.isArray(d?.equityData) ? d.equityData : [],
        dates: Array.isArray(d?.dates) ? d.dates : [],
        isRealData: Boolean(d?.isRealData),
      };
    } catch {
      return {equityData: [], dates: [], isRealData: false};
    }
  },
};
