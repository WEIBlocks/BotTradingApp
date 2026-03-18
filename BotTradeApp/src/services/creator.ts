import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface DataWrap<T> { data: T }

interface StatsResponse {
  totalBots: number;
  activeSubscribers: number;
  avgRating: string;
  totalReviews: number;
  totalRevenue: string;
}

interface RevenueRow {
  month: string;
  revenue: string;
}

interface CreatorBotRow {
  id: string;
  name: string;
  subtitle: string | null;
  strategy: string;
  category: string | null;
  riskLevel: string | null;
  priceMonthly: string | null;
  creatorFeePercent: string | null;
  platformFeePercent: string | null;
  status: string;
  isPublished: boolean;
  avatarColor: string | null;
  avatarLetter: string | null;
  return30d: string | null;
  winRate: string | null;
  activeUsers: number | null;
  avgRating: string | null;
  reviewCount: number | null;
}

interface AiSuggestionRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
}

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface CreatorStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalUsers: number;
  avgRating: number;
  reviewCount: number;
  totalBots: number;
}

export interface CreatorBot {
  id: string;
  name: string;
  users: number;
  rating: number;
  returnPercent: number;
  revenue: number;
  isPublished: boolean;
  creatorFeePercent: number;
  platformFeePercent: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface AiSuggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
}

export interface EarningsSummary {
  totalEarnings: number;
  totalPlatformFees: number;
  totalSubscriberProfits: number;
  pendingPayout: number;
  activeSubscribers: number;
  transactionCount: number;
  botEarnings: BotEarning[];
  recentEarnings: RecentEarning[];
}

export interface BotEarning {
  botId: string;
  botName: string;
  totalEarning: number;
  totalSubscriberProfit: number;
  transactions: number;
}

export interface RecentEarning {
  id: string;
  botName: string;
  subscriberProfit: string;
  creatorFeePercent: string;
  creatorEarning: string;
  platformFee: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface EarningsProjection {
  botId: string;
  botName: string;
  creatorFeePercent: number;
  platformFeePercent: number;
  activeUsers: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const creatorApi = {
  async getStats(): Promise<CreatorStats> {
    const res = await api.get<DataWrap<StatsResponse>>('/creator/stats');
    const d = res?.data;
    return {
      totalRevenue: parseFloat(d?.totalRevenue ?? '0') || 0,
      monthlyRevenue: 0, // will be computed from monthly revenue endpoint
      totalUsers: Number(d?.activeSubscribers) || 0,
      avgRating: parseFloat(d?.avgRating ?? '0') || 0,
      reviewCount: Number(d?.totalReviews) || 0,
      totalBots: Number(d?.totalBots) || 0,
    };
  },

  async getMonthlyRevenue(months = 6): Promise<MonthlyRevenue[]> {
    const res = await api.get<DataWrap<RevenueRow[]>>(`/creator/revenue/monthly?months=${months}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(r => ({
      month: r.month ?? '',
      revenue: parseFloat(r.revenue) || 0,
    }));
  },

  async getBots(): Promise<CreatorBot[]> {
    const res = await api.get<DataWrap<CreatorBotRow[]>>('/creator/bots');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(b => ({
      id: b.id ?? '',
      name: b.name ?? 'Unknown Bot',
      users: Number(b.activeUsers) || 0,
      rating: parseFloat(b.avgRating ?? '0') || 0,
      returnPercent: parseFloat(b.return30d ?? '0') || 0,
      revenue: parseFloat(b.priceMonthly ?? '0') * (Number(b.activeUsers) || 0),
      isPublished: b.isPublished ?? false,
      creatorFeePercent: parseFloat(b.creatorFeePercent ?? '10'),
      platformFeePercent: parseFloat(b.platformFeePercent ?? '3'),
    }));
  },

  async getEarnings(): Promise<EarningsSummary> {
    const res = await api.get<DataWrap<EarningsSummary>>('/creator/earnings');
    return res?.data ?? {
      totalEarnings: 0,
      totalPlatformFees: 0,
      totalSubscriberProfits: 0,
      pendingPayout: 0,
      activeSubscribers: 0,
      transactionCount: 0,
      botEarnings: [],
      recentEarnings: [],
    };
  },

  async getEarningsProjection(): Promise<EarningsProjection[]> {
    const res = await api.get<DataWrap<EarningsProjection[]>>('/creator/earnings/projection');
    return Array.isArray(res?.data) ? res.data : [];
  },

  async getAiSuggestions(): Promise<AiSuggestion[]> {
    const res = await api.get<DataWrap<AiSuggestionRow[]>>('/creator/ai-suggestions');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(s => ({
      id: s.id ?? '',
      title: s.title ?? '',
      description: s.description ?? '',
      category: s.category ?? '',
      priority: s.priority ?? 'medium',
    }));
  },

  async publishBot(botId: string) {
    return api.post(`/creator/bots/${botId}/publish`, {});
  },
};
