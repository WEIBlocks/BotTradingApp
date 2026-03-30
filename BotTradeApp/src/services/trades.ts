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
  mode?: 'live' | 'shadow' | 'all';
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

function safeDateParse(val: any): Date {
  if (!val || val === 'null' || val === 'undefined') return new Date(0);
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date(0) : val;
  const str = String(val);
  if (str.length < 8) return new Date(0);
  const ms = Date.parse(str);
  if (!isNaN(ms) && ms > 0) return new Date(ms);
  return new Date(0);
}

function mapTrade(t: any): Trade {
  const ts = t.executedAt ?? t.executed_at ?? t.timestamp ?? t.createdAt ?? t.created_at;
  return {
    id: t.id ?? '',
    symbol: t.symbol ?? '',
    side: (String(t.side).toUpperCase() ?? 'BUY') as Trade['side'],
    amount: parseFloat(String(t.amount)) || 0,
    price: parseFloat(String(t.price)) || 0,
    timestamp: safeDateParse(ts),
    botId: t.botId ?? t.bot_id ?? '',
    botName: t.botName ?? t.bot_name ?? 'Bot',
    pnl: t.pnl != null ? parseFloat(String(t.pnl)) : undefined,
    pnlPercent: t.pnlPercent != null ? parseFloat(String(t.pnlPercent)) : undefined,
    mode: t.mode ?? (String(t.isPaper ?? t.is_paper) === 'true' ? 'shadow' : 'live'),
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
