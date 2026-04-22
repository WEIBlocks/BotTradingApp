import {api} from './api';
import type {Bot, RiskLevel, BotStatus, MonthlyReturn, Trade, Review} from '../types';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface BackendBot {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  strategy: string;
  category: string;
  riskLevel: string;
  priceMonthly: number;
  tags: string[];
  avatarColor: string;
  avatarLetter: string;
  status: string;
  config: Record<string, unknown> | null;
  creatorId?: string;
  creatorName: string;
  isPublished: boolean;
  // Statistics (joined from botStatistics)
  return30d: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  activeUsers: number;
  reviewCount: number;
  avgRating: number;
  monthlyReturns: MonthlyReturn[];
  equityData: number[];
  // Optional detailed fields (present in single-bot response)
  recentTrades?: Trade[];
  reviews?: Review[];
  aggregateStats?: {
    totalUsers: number; totalPositions: number; openPositions: number;
    closedPositions: number; winningPositions: number; totalPnl: number;
    avgPnlPercent: number; totalTrades: number; totalSubscribers: number;
    activeSubscribers: number; liveSubscribers: number;
  } | null;
}

// ─── Query Parameters ───────────────────────────────────────────────────────

export interface MarketplaceQuery {
  category?: string;
  risk?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

// ─── Transform ──────────────────────────────────────────────────────────────

function mapBot(b: BackendBot): Bot {
  return {
    id: b.id ?? '',
    name: b.name ?? 'Unknown Bot',
    subtitle: b.subtitle ?? '',
    description: b.description ?? '',
    strategy: b.strategy ?? '',
    creatorId: b.creatorId,
    creatorName: b.creatorName ?? '',
    avatarColor: b.avatarColor ?? '#6C63FF',
    avatarLetter: b.avatarLetter ?? (b.name?.[0] ?? 'B'),
    returnPercent: Number(b.return30d) || 0,
    winRate: Number(b.winRate) || 0,
    maxDrawdown: Number(b.maxDrawdown) || 0,
    sharpeRatio: Number(b.sharpeRatio) || 0,
    risk: (b.riskLevel ?? 'Medium') as RiskLevel,
    price: Number(b.priceMonthly) || 0,
    status: (b.status ?? 'inactive') as BotStatus,
    tags: b.tags ?? [],
    activeUsers: Number(b.activeUsers) || 0,
    reviewCount: Number(b.reviewCount) || 0,
    rating: Number(b.avgRating) || 0,
    monthlyReturns: (b.monthlyReturns ?? []).map((m: any) => ({
      month: m.month ?? '',
      percent: Number(m.percent ?? m.return) || 0,
    })),
    recentTrades: b.recentTrades ?? [],
    equityData: b.equityData ?? [],
    reviews: b.reviews ?? [],
    category: (b.category ?? 'Crypto') as Bot['category'],
    config: b.config ?? null,
    aggregateStats: b.aggregateStats ?? null,
  };
}

// ─── Marketplace API ────────────────────────────────────────────────────────

function buildQueryString(params: MarketplaceQuery): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// Backend wraps single items in { data: T }, lists in { data: T[], pagination: {...} }
interface DataWrap<T> { data: T }
interface PaginatedWrap<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }

export const marketplaceApi = {
  /** List bots with optional filters, search, sort, and pagination. */
  async getBots(
    query: MarketplaceQuery = {},
  ): Promise<{bots: Bot[]; total: number; page: number; totalPages: number}> {
    const qs = buildQueryString(query);
    const res = await api.get<any>(`/marketplace/bots${qs}`);
    // Response: { data: [...], pagination: { page, limit, total, totalPages } }
    const items = Array.isArray(res?.data) ? res.data : [];
    return {
      bots: items.map(mapBot),
      total: res?.pagination?.total ?? items.length,
      page: res?.pagination?.page ?? 1,
      totalPages: res?.pagination?.totalPages ?? 1,
    };
  },

  /** Get the current featured bot. */
  async getFeaturedBot(): Promise<Bot> {
    const res = await api.get<any>('/marketplace/bots/featured');
    // Response: { data: botObj }
    return mapBot(res?.data ?? res);
  },

  /** Get trending bots. */
  async getTrendingBots(): Promise<Bot[]> {
    const res = await api.get<any>('/marketplace/bots/trending');
    // Response: { data: [...] }
    const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    return items.map(mapBot);
  },

  /** Get full bot details by ID. */
  async getBotDetails(id: string): Promise<Bot> {
    const res = await api.get<any>(`/marketplace/bots/${id}`);
    // Response: { data: botObj }
    return mapBot(res?.data ?? res);
  },
};
