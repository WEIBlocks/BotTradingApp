import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface PortfolioSummaryResponse {
  totalValue: string;
  change24h: string;
  change24hPercent: string;
  totalRealizedPnl?: string;
  closedPositions?: number;
  openPositions?: number;
}

interface AssetResponse {
  id: string;
  symbol: string;
  name: string;
  amount: string;
  valueUsd: string;
  change24h: string;
  allocation: string;
  iconColor: string;
  provider: string;
}

interface AllocationResponse {
  symbol: string;
  name: string;
  amount?: number;
  value: string;
  percentage: string;
  iconColor: string;
}

interface DataWrap<T> { data: T }

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  totalChange24h: number;
  totalChangePercent24h: number;
  totalRealizedPnl: number;
  closedPositions: number;
  openPositions: number;
}

export interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number;
  change24h: number;
  allocation: number;
  iconColor: string;
  provider: string;
}

export interface AllocationItem {
  label: string;
  amount: number;
  value: number;
  percent: number;
  color: string;
}

export interface BotPnl {
  botId: string;
  botName: string;
  isPaper: boolean;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  avgPnlPercent: number;
  bestTrade: number;
  worstTrade: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export type PortfolioMode = 'live' | 'testnet';

export const portfolioApi = {
  async getModes(): Promise<{hasLive: boolean; hasTestnet: boolean}> {
    const res = await api.get<DataWrap<{hasLive: boolean; hasTestnet: boolean}>>('/portfolio/modes').catch(() => null);
    return (res as any)?.data ?? {hasLive: false, hasTestnet: false};
  },

  async getSummary(mode?: PortfolioMode): Promise<PortfolioSummary> {
    const qs = mode ? `?mode=${mode}` : '';
    const res = await api.get<DataWrap<PortfolioSummaryResponse>>(`/portfolio/summary${qs}`);
    const d = res?.data;
    return {
      totalValue: parseFloat(d?.totalValue ?? '0') || 0,
      totalChange24h: parseFloat(d?.change24h ?? '0') || 0,
      totalChangePercent24h: parseFloat(d?.change24hPercent ?? '0') || 0,
      totalRealizedPnl: parseFloat(d?.totalRealizedPnl ?? '0') || 0,
      closedPositions: Number(d?.closedPositions ?? 0),
      openPositions: Number(d?.openPositions ?? 0),
    };
  },

  async getAssets(mode?: PortfolioMode): Promise<PortfolioAsset[]> {
    const qs = mode ? `?mode=${mode}` : '';
    const res = await api.get<DataWrap<AssetResponse[]>>(`/portfolio/assets${qs}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items
      .filter(a => parseFloat(a.amount) > 0)
      .map(a => ({
        id: a.id ?? '',
        symbol: a.symbol ?? '',
        name: a.name ?? '',
        amount: parseFloat(a.amount) || 0,
        valueUsd: parseFloat(a.valueUsd) || 0,
        change24h: parseFloat(a.change24h) || 0,
        allocation: parseFloat(a.allocation) || 0,
        iconColor: a.iconColor ?? '#6B7280',
        provider: a.provider ?? '',
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  },

  async getAllocation(mode?: PortfolioMode): Promise<AllocationItem[]> {
    const qs = mode ? `?mode=${mode}` : '';
    const res = await api.get<DataWrap<AllocationResponse[]>>(`/portfolio/allocation${qs}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items
      .filter(a => parseFloat(a.percentage) > 0)
      .map(a => ({
        label: a.symbol ?? '',
        amount: Number(a.amount ?? 0),
        value: parseFloat(a.value) || 0,
        percent: parseFloat(a.percentage) || 0,
        color: a.iconColor ?? '#6B7280',
      }))
      .sort((a, b) => b.percent - a.percent);
  },

  async getPnlByBot(): Promise<BotPnl[]> {
    const res = await api.get<DataWrap<any[]>>('/portfolio/pnl');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(r => ({
      botId: r.bot_id ?? '',
      botName: r.bot_name ?? '',
      isPaper: Boolean(r.is_paper),
      totalTrades: Number(r.total_trades ?? 0),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      totalPnl: parseFloat(r.total_pnl ?? '0'),
      avgPnlPercent: parseFloat(r.avg_pnl_percent ?? '0'),
      bestTrade: parseFloat(r.best_trade ?? '0'),
      worstTrade: parseFloat(r.worst_trade ?? '0'),
    }));
  },
};
