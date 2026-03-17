import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface PortfolioSummaryResponse {
  totalValue: string;
  change24h: string;
  change24hPercent: string;
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
  percent: number;
  color: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const portfolioApi = {
  async getSummary(): Promise<PortfolioSummary> {
    const res = await api.get<DataWrap<PortfolioSummaryResponse>>('/portfolio/summary');
    const d = res?.data;
    return {
      totalValue: parseFloat(d?.totalValue ?? '0') || 0,
      totalChange24h: parseFloat(d?.change24h ?? '0') || 0,
      totalChangePercent24h: parseFloat(d?.change24hPercent ?? '0') || 0,
    };
  },

  async getAssets(): Promise<PortfolioAsset[]> {
    const res = await api.get<DataWrap<AssetResponse[]>>('/portfolio/assets');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(a => ({
      id: a.id ?? '',
      symbol: a.symbol ?? '',
      name: a.name ?? '',
      amount: parseFloat(a.amount) || 0,
      valueUsd: parseFloat(a.valueUsd) || 0,
      change24h: parseFloat(a.change24h) || 0,
      allocation: parseFloat(a.allocation) || 0,
      iconColor: a.iconColor ?? '#6B7280',
      provider: a.provider ?? '',
    }));
  },

  async getAllocation(): Promise<AllocationItem[]> {
    const res = await api.get<DataWrap<AllocationResponse[]>>('/portfolio/allocation');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(a => ({
      label: a.symbol ?? '',
      percent: parseFloat(a.percentage) || 0,
      color: a.iconColor ?? '#6B7280',
    }));
  },
};
