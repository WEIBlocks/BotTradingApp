import {api} from './api';
import type {Bot, BotStatus, RiskLevel} from '../types';

// ─── Backend row shape ──────────────────────────────────────────────────────
// Matches getUserFavorites() in backend/src/modules/bots/bots.service.ts.
interface FavoriteBotRow {
  id: string;
  name: string;
  subtitle: string | null;
  strategy: string;
  category: string | null;
  riskLevel: string | null;
  priceMonthly: string | null;
  tags: string[] | null;
  avatarColor: string | null;
  avatarLetter: string | null;
  avatarUrl: string | null;
  status: string;
  isPublished: boolean;
  creatorId: string | null;
  config: any;
  return30d: string | null;
  winRate: string | null;
  maxDrawdown: string | null;
  sharpeRatio: string | null;
  activeUsers: number | null;
  avgRating: string | null;
  reviewCount: number | null;
  creatorName: string | null;
  favoritedAt: string | null;
}

// Map a favorites-row to the mobile Bot shape (mirrors marketplace.ts mapBot).
export function mapFavoriteRow(b: FavoriteBotRow): Bot {
  return {
    id: b.id ?? '',
    name: b.name ?? 'Unknown Bot',
    subtitle: b.subtitle ?? '',
    description: '',
    strategy: b.strategy ?? '',
    creatorId: b.creatorId ?? undefined,
    creatorName: b.creatorName ?? '',
    avatarColor: b.avatarColor ?? '#6C63FF',
    avatarLetter: b.avatarLetter ?? (b.name?.[0] ?? 'B'),
    avatarUrl: b.avatarUrl ?? null,
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
    monthlyReturns: [],
    recentTrades: [],
    equityData: [],
    reviews: [],
    category: (b.category ?? 'Crypto') as Bot['category'],
    config: b.config ?? null,
  };
}

export const favoritesApi = {
  /** List the user's favorite bots, most-recently-favorited first. */
  async list(): Promise<Bot[]> {
    const res = await api.get<{data: FavoriteBotRow[]}>('/bots/user/favorites');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapFavoriteRow);
  },

  /** Add a bot to favorites (idempotent — backend uses ON CONFLICT DO NOTHING). */
  async add(botId: string): Promise<void> {
    await api.post(`/bots/${botId}/favorite`, {});
  },

  /** Remove a bot from favorites. */
  async remove(botId: string): Promise<void> {
    await api.delete(`/bots/${botId}/favorite`);
  },

  /** Check whether a single bot is in the user's favorites. */
  async status(botId: string): Promise<{favorited: boolean}> {
    const res = await api.get<{data: {favorited: boolean; botId: string}}>(`/bots/${botId}/favorite`);
    return {favorited: !!res?.data?.favorited};
  },
};
