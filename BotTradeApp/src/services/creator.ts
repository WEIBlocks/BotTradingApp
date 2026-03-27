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

// ─── Analytics Types ───────────────────────────────────────────────────────

export interface EngagementMetrics {
  totalViews: number;
  totalPurchases: number;
  subscriberGrowthRate: number;
  churnRate: number;
  periodDays: number;
}

export interface UserProfitability {
  topEarners: Array<{
    userId: string;
    username: string;
    totalProfit: number;
    botName: string;
  }>;
  profitDistribution: {
    profitable: number;
    breakeven: number;
    losing: number;
  };
}

export interface ChurnAnalytics {
  overallChurnRate: number;
  atRiskUsers: number;
  perBotChurn: Array<{
    botId: string;
    botName: string;
    churnRate: number;
  }>;
}

export interface RevenueProjection {
  period: string;
  months: number;
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

export interface MarketingFunnel {
  published: number;
  purchased: number;
  active: number;
  retained: number;
  publishedToPurchased: number;
  purchasedToActive: number;
  activeToRetained: number;
}

export interface Experiment {
  id: string;
  botId: string;
  botName?: string;
  name: string;
  description: string;
  status: 'draft' | 'running' | 'completed';
  variantAConfig: Record<string, unknown>;
  variantBConfig: Record<string, unknown>;
  createdAt: string;
}

export interface ExperimentResults {
  id: string;
  name: string;
  status: string;
  variantA: {
    users: number;
    avgReturn: number;
    avgProfit: number;
  };
  variantB: {
    users: number;
    avgReturn: number;
    avgProfit: number;
  };
  confidence: number;
  winner: 'A' | 'B' | 'none';
}

export interface PatternAnalysis {
  botId: string;
  botName: string;
  patterns: Array<{
    name: string;
    description: string;
    frequency: string;
  }>;
  marketCorrelations: Array<{
    market: string;
    correlation: number;
  }>;
  riskScore: number;
  consistencyScore: number;
  suggestedImprovements: string[];
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

  // ─── Analytics ──────────────────────────────────────────────────────────────

  async getEngagement(days = 30): Promise<EngagementMetrics> {
    const res = await api.get<DataWrap<EngagementMetrics>>(`/creator/analytics/engagement?days=${days}`);
    return res?.data ?? { totalViews: 0, totalPurchases: 0, subscriberGrowthRate: 0, churnRate: 0, periodDays: days };
  },

  async getUserProfitability(): Promise<UserProfitability> {
    const res = await api.get<DataWrap<any>>('/creator/analytics/user-profitability');
    const d = res?.data;
    const dist = d?.distribution ?? d?.profitDistribution ?? { profitable: 0, breakeven: 0, losing: 0 };
    const earners = Array.isArray(d?.topEarners) ? d.topEarners : [];
    return {
      topEarners: earners.map((e: any) => ({
        userId: e.userId ?? '',
        username: e.userName ?? e.username ?? 'User',
        totalProfit: Number(e.totalProfit ?? 0),
        botName: e.botName ?? '',
      })),
      profitDistribution: {
        profitable: Number(dist.profitable ?? 0),
        breakeven: Number(dist.breakeven ?? 0),
        losing: Number(dist.losing ?? 0),
      },
    };
  },

  async getChurnAnalytics(): Promise<ChurnAnalytics> {
    const res = await api.get<DataWrap<ChurnAnalytics>>('/creator/analytics/churn');
    return res?.data ?? { overallChurnRate: 0, atRiskUsers: 0, perBotChurn: [] };
  },

  async getRevenueProjection(): Promise<RevenueProjection[]> {
    const res = await api.get<DataWrap<any>>('/creator/analytics/revenue-projection');
    const d = res?.data;
    if (!d?.projections) return [];
    const p = d.projections;
    return [
      { period: '3 Months', months: 3, optimistic: p.threeMonth?.optimistic?.totalRevenue ?? 0, realistic: p.threeMonth?.realistic?.totalRevenue ?? 0, pessimistic: p.threeMonth?.pessimistic?.totalRevenue ?? 0 },
      { period: '6 Months', months: 6, optimistic: p.sixMonth?.optimistic?.totalRevenue ?? 0, realistic: p.sixMonth?.realistic?.totalRevenue ?? 0, pessimistic: p.sixMonth?.pessimistic?.totalRevenue ?? 0 },
      { period: '12 Months', months: 12, optimistic: p.twelveMonth?.optimistic?.totalRevenue ?? 0, realistic: p.twelveMonth?.realistic?.totalRevenue ?? 0, pessimistic: p.twelveMonth?.pessimistic?.totalRevenue ?? 0 },
    ];
  },

  async getMarketingFunnel(): Promise<MarketingFunnel> {
    const res = await api.get<DataWrap<any>>('/creator/analytics/marketing');
    const d = res?.data;
    const funnel = d?.funnel ?? {};
    const rates = d?.conversionRates ?? {};
    return {
      published: funnel.published ?? 0,
      purchased: funnel.totalPurchases ?? 0,
      active: funnel.activeUsers ?? 0,
      retained: funnel.reviewers ?? 0,
      publishedToPurchased: rates.purchaseRate ?? 0,
      purchasedToActive: rates.retentionRate ?? 0,
      activeToRetained: rates.reviewRate ?? 0,
    };
  },

  // ─── A/B Experiments ────────────────────────────────────────────────────────

  async getExperiments(): Promise<Experiment[]> {
    const res = await api.get<DataWrap<Experiment[]>>('/creator/experiments');
    return Array.isArray(res?.data) ? res.data : [];
  },

  async createExperiment(data: { botId: string; name: string; description: string; variantAConfig: Record<string, unknown>; variantBConfig: Record<string, unknown> }): Promise<Experiment> {
    const res = await api.post<DataWrap<Experiment>>('/creator/experiments', data as unknown as Record<string, unknown>);
    return res?.data as Experiment;
  },

  async getExperimentResults(id: string): Promise<ExperimentResults> {
    const res = await api.get<DataWrap<any>>(`/creator/experiments/${id}/results`);
    const d = res?.data;
    const exp = d?.experiment ?? {};
    const analysis = d?.analysis ?? {};
    return {
      id: exp.id ?? id,
      name: exp.name ?? '',
      status: exp.status ?? 'draft',
      variantA: {
        users: exp.variantASubscribers ?? 0,
        avgReturn: analysis.returnA ?? 0,
        avgProfit: analysis.avgRevenuePerUserA ?? 0,
      },
      variantB: {
        users: exp.variantBSubscribers ?? 0,
        avgReturn: analysis.returnB ?? 0,
        avgProfit: analysis.avgRevenuePerUserB ?? 0,
      },
      confidence: analysis.confidence ?? 0,
      winner: analysis.winner ?? 'none',
    };
  },

  async stopExperiment(id: string): Promise<void> {
    await api.put(`/creator/experiments/${id}/stop`, {});
  },

  // ─── Patterns ───────────────────────────────────────────────────────────────

  async getBotPatterns(botId: string): Promise<PatternAnalysis> {
    const res = await api.get<DataWrap<any>>(`/creator/bots/${botId}/patterns`);
    const d = res?.data;
    // Transform API response to match frontend interface
    const detectedPatterns = Array.isArray(d?.detectedPatterns) ? d.detectedPatterns : [];
    const marketCorr = d?.marketCorrelation ?? {};
    const improvements = Array.isArray(d?.suggestedImprovements) ? d.suggestedImprovements : [];

    return {
      botId: d?.botId ?? botId,
      botName: d?.botName ?? '',
      patterns: detectedPatterns.map((p: any) => ({
        name: p?.pattern ?? p?.name ?? 'Unknown',
        description: p?.description ?? '',
        frequency: p?.confidence ? `${(p.confidence * 100).toFixed(0)}% confidence` : '',
      })),
      marketCorrelations: Object.entries(marketCorr).map(([market, corr]) => ({
        market: market.toUpperCase(),
        correlation: typeof corr === 'number' ? corr : 0,
      })),
      riskScore: Number(d?.riskScore ?? 0),
      consistencyScore: Number(d?.consistencyScore ?? 0),
      suggestedImprovements: improvements.map((s: any) =>
        typeof s === 'string' ? s : `${s?.title ?? ''}: ${s?.description ?? ''}`
      ),
    };
  },
};
