import {api} from './api';
import type {Trade, LiveTrade} from '../types';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface TradeRow {
  id: string;
  symbol: string;
  side: string;
  amount: string;
  price: string;
  totalValue: string;
  pnl: string | null;
  pnlPercent: string | null;
  isPaper: boolean;
  reasoning: string | null;
  status: string;
  executedAt: string;
  botId: string | null;
  botName: string | null;
  botAvatarColor: string | null;
  botAvatarLetter: string | null;
  botCreatorId: string | null;
  isOwned: boolean;
}

interface DataWrap<T> { data: T }

interface PaginatedWrap<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface TradeHistoryQuery {
  symbol?: string;
  side?: string;
  is_paper?: boolean;
  botId?: string;
  page?: number;
  limit?: number;
}

export interface TradeHistoryResult {
  trades: Trade[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TradeSummary {
  totalPnl: number;
  totalTrades: number;
  winRate: number;
}

// ─── Transform ──────────────────────────────────────────────────────────────

function mapTrade(t: TradeRow): Trade {
  return {
    id: t.id ?? '',
    symbol: t.symbol ?? '',
    side: (t.side?.toUpperCase() ?? 'BUY') as Trade['side'],
    amount: parseFloat(t.amount) || 0,
    price: parseFloat(t.price) || 0,
    timestamp: new Date(t.executedAt ?? Date.now()),
    botId: t.botId ?? '',
    botName: t.botName ?? 'Manual Trade',
    pnl: t.pnl != null ? parseFloat(t.pnl) : undefined,
    pnlPercent: t.pnlPercent != null ? parseFloat(t.pnlPercent) : undefined,
  };
}

function mapLiveTrade(t: TradeRow): LiveTrade {
  return {
    ...mapTrade(t),
    isLive: t.status === 'open' || t.status === 'pending',
    isOwned: t.isOwned ?? true,
    isPaper: t.isPaper ?? false,
    reasoning: t.reasoning ?? undefined,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

export const tradesApi = {
  /** Get recent trades (small set for dashboard). */
  async getRecent(limit = 5): Promise<Trade[]> {
    const res = await api.get<DataWrap<TradeRow[]>>(`/trades/recent?limit=${limit}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapTrade);
  },

  /** Get full trade history with filters and pagination. */
  async getHistory(query: TradeHistoryQuery = {}): Promise<TradeHistoryResult> {
    const params = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const qs = params ? `?${params}` : '';
    const res = await api.get<any>(`/trades/history${qs}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return {
      trades: items.map(mapTrade),
      total: res?.pagination?.total ?? items.length,
      page: res?.pagination?.page ?? 1,
      totalPages: res?.pagination?.totalPages ?? 1,
    };
  },

  /** Get live/recent trades for the live feed screen. */
  async getLiveFeed(limit = 20): Promise<LiveTrade[]> {
    const res = await api.get<DataWrap<TradeRow[]>>(`/trades/recent?limit=${limit}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapLiveTrade);
  },

  /** Calculate summary stats from trade history. */
  async getSummary(): Promise<TradeSummary> {
    const res = await api.get<any>('/trades/history?limit=100');
    const items: TradeRow[] = Array.isArray(res?.data) ? res.data : [];
    let totalPnl = 0;
    let wins = 0;
    for (const t of items) {
      const pnl = parseFloat(t.pnl ?? '0') || 0;
      totalPnl += pnl;
      if (pnl > 0) wins++;
    }
    return {
      totalPnl,
      totalTrades: items.length,
      winRate: items.length > 0 ? (wins / items.length) * 100 : 0,
    };
  },
};
