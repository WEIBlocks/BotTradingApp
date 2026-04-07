import {api} from './api';
import type {Gladiator} from '../types';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface DataWrap<T> { data: T }

interface ArenaBotRow {
  id: string;
  name: string;
  subtitle: string | null;
  strategy: string;
  category: string | null;
  riskLevel: string | null;
  avatarColor: string | null;
  avatarLetter: string | null;
  return30d: string | null;
  winRate: string | null;
  avgRating: string | null;
}

interface GladiatorRow {
  id: string;
  botId: string;
  rank: number | null;
  finalReturn: string | null;
  winRate: string | null;
  equityData: number[];
  isWinner: boolean | null;
  botName: string;
  botSubtitle: string | null;
  botStrategy: string;
  botAvatar: string | null;
  botColor: string | null;
  botRiskLevel: string | null;
}

interface SessionResponse {
  id: string;
  userId: string;
  status: string;
  durationSeconds: number;
  startedAt: string;
  updatedAt: string;
  gladiators: GladiatorRow[];
  progress?: number;
  elapsedSeconds?: number;
  remainingSeconds?: number;
}

interface ResultsResponse {
  session: {
    id: string;
    status: string;
    durationSeconds: number;
    startedAt: string;
  };
  winner: GladiatorRow | null;
  rankings: GladiatorRow[];
  totalGladiators: number;
}

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface ArenaSession {
  id: string;
  status: string;
  durationSeconds: number;
  progress: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  gladiators: Gladiator[];
  virtualBalance?: string;
  cryptoBalance?: string | null;
  stockBalance?: string | null;
  isMixed?: boolean;
  hasCrypto?: boolean;
  hasStocks?: boolean;
  perBotAllocation?: string | null;
  marketOpen?: boolean;
}

export interface ArenaHistoryItem {
  id: string;
  status: string;
  durationSeconds: number;
  startedAt: string;
  endedAt: string | null;
  botCount: number;
  winnerName: string | null;
  winnerReturn: string | null;
  winnerColor: string | null;
}

export interface ArenaResults {
  winnerId: string;
  rankings: Gladiator[];
  totalGladiators: number;
  stats?: {
    totalTrades: number;
    totalBuys: number;
    totalSells: number;
    bestReturn: string;
    worstReturn: string;
    botCount: number;
  };
  session?: {
    virtualBalance: string;
    durationSeconds: number;
    startedAt: string;
    endedAt: string | null;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapBotToGladiator(b: ArenaBotRow, index: number): Gladiator {
  return {
    id: b.id,
    name: b.name ?? 'Unknown Bot',
    strategy: b.strategy ?? '',
    statLabel: `${parseFloat(b.winRate ?? '0').toFixed(0)}% Win Rate`,
    winRate: parseFloat(b.winRate ?? '0') || 0,
    level: Math.floor((parseFloat(b.return30d ?? '0') || 0) + 20),
    avatarColor: b.avatarColor ?? ['#10B981', '#3B82F6', '#EC4899', '#22D3EE', '#A855F7'][index % 5],
    selected: index < 3,
    currentReturn: parseFloat(b.return30d ?? '0') || 0,
    equityData: [],
    category: b.category,
    // assetClass detected by backend
    assetClass: (b as any).assetClass ?? 'crypto',
  };
}

function mapGladiatorRow(g: any): Gladiator {
  const ret = parseFloat(g.finalReturn ?? g.currentReturn ?? '0') || 0;
  return {
    // Core identity
    id: g.botId ?? g.id,
    gladiatorId: g.id, // keep the arena gladiator row ID as well
    name: g.botName ?? g.name ?? 'Unknown',
    strategy: g.botStrategy ?? g.strategy ?? '',
    statLabel: g.isWinner ? 'Champion' : g.rank ? `Rank #${g.rank}` : '',
    winRate: parseFloat(g.winRate ?? g.currentWinRate ?? '0') || 0,
    level: Math.max(1, Math.round(Math.abs(ret) * 2 + 10)),
    avatarColor: g.botColor ?? g.avatarColor ?? '#6C63FF',
    selected: true,
    currentReturn: ret,
    equityData: Array.isArray(g.equityData) ? g.equityData : [],
    totalTrades: g.totalTrades ?? g.currentTrades ?? 0,
    totalPnl: parseFloat(g.totalPnl ?? g.currentPnl ?? '0') || 0,
    decisionLog: Array.isArray(g.decisionLog) ? g.decisionLog : [],
    // Extra fields from live/results session endpoints (pass-through)
    trades: Array.isArray(g.trades) ? g.trades : [],
    detailedStats: g.detailedStats ?? null,
    tradeBreakdown: g.tradeBreakdown ?? null,
    category: g.category ?? g.botCategory ?? null,
    currentWins: g.currentWins ?? 0,
    currentLosses: g.currentLosses ?? 0,
    currentTrades: g.currentTrades ?? g.totalTrades ?? 0,
    currentPnl: parseFloat(g.currentPnl ?? g.totalPnl ?? '0') || 0,
    openPositionCount: g.openPositionCount ?? 0,
    closedPositionCount: g.closedPositionCount ?? 0,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

export const arenaApi = {
  /** Get bots available for arena battles. */
  async getAvailableBots(): Promise<Gladiator[]> {
    const res = await api.get<DataWrap<ArenaBotRow[]>>('/arena/bots');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapBotToGladiator);
  },

  /** Create a new arena session. */
  async createSession(
    botIds: string[],
    durationSeconds = 300,
    mode: 'shadow' | 'live' = 'shadow',
    virtualBalance = 10000,
    cryptoBalance?: number,
    stockBalance?: number,
  ): Promise<ArenaSession> {
    const body: Record<string, unknown> = { botIds, durationSeconds, mode, virtualBalance };
    if (cryptoBalance !== undefined) body.cryptoBalance = cryptoBalance;
    if (stockBalance !== undefined) body.stockBalance = stockBalance;
    const res = await api.post<DataWrap<SessionResponse>>('/arena/session', body);
    const s = res?.data;
    return {
      id: s?.id ?? '',
      status: s?.status ?? 'running',
      durationSeconds: s?.durationSeconds ?? durationSeconds,
      progress: s?.progress ?? 0,
      elapsedSeconds: s?.elapsedSeconds ?? 0,
      remainingSeconds: s?.remainingSeconds ?? durationSeconds,
      gladiators: (s?.gladiators ?? []).map(mapGladiatorRow),
      virtualBalance: (s as any)?.virtualBalance,
      cryptoBalance: (s as any)?.cryptoBalance,
      stockBalance: (s as any)?.stockBalance,
      isMixed: (s as any)?.isMixed ?? false,
      hasCrypto: (s as any)?.hasCrypto ?? true,
      hasStocks: (s as any)?.hasStocks ?? false,
      perBotAllocation: (s as any)?.perBotAllocation,
    };
  },

  /** Get live session status. */
  async getSession(sessionId: string): Promise<ArenaSession> {
    const res = await api.get<DataWrap<SessionResponse>>(`/arena/session/${sessionId}`);
    const s = res?.data;
    return {
      id: s?.id ?? '',
      status: s?.status ?? 'running',
      durationSeconds: s?.durationSeconds ?? 300,
      progress: s?.progress ?? 0,
      elapsedSeconds: s?.elapsedSeconds ?? 0,
      remainingSeconds: s?.remainingSeconds ?? 0,
      gladiators: (s?.gladiators ?? []).map(mapGladiatorRow),
      virtualBalance: (s as any)?.virtualBalance,
      cryptoBalance: (s as any)?.cryptoBalance,
      stockBalance: (s as any)?.stockBalance,
      isMixed: (s as any)?.isMixed ?? false,
      hasCrypto: (s as any)?.hasCrypto ?? true,
      hasStocks: (s as any)?.hasStocks ?? false,
      perBotAllocation: (s as any)?.perBotAllocation,
      marketOpen: (s as any)?.marketOpen,
    };
  },

  /** Fetch connected exchange balances for live arena validation. */
  async getExchangeBalances(): Promise<{cryptoBalance: number; stockBalance: number; hasCrypto: boolean; hasStocks: boolean}> {
    try {
      const res = await api.get<DataWrap<any[]>>('/user/exchanges');
      const conns = Array.isArray(res?.data) ? res.data : [];
      const cryptoConn = conns.find((c: any) => c.assetClass === 'crypto' || c.provider === 'binance');
      const stockConn = conns.find((c: any) => c.assetClass === 'stocks' || c.provider === 'alpaca');
      return {
        cryptoBalance: cryptoConn ? parseFloat(cryptoConn.totalBalance ?? '0') : 0,
        stockBalance: stockConn ? parseFloat(stockConn.totalBalance ?? '0') : 0,
        hasCrypto: !!cryptoConn,
        hasStocks: !!stockConn,
      };
    } catch {
      return { cryptoBalance: 0, stockBalance: 0, hasCrypto: false, hasStocks: false };
    }
  },

  /** Get user's arena battle history. */
  async getHistory(): Promise<ArenaHistoryItem[]> {
    const res = await api.get<DataWrap<ArenaHistoryItem[]>>('/arena/history');
    return Array.isArray(res?.data) ? res.data : [];
  },

  /** Get user's active running session (if any). Returns null if none. */
  async getActiveSession(): Promise<ArenaSession | null> {
    const res = await api.get<DataWrap<SessionResponse | null>>('/arena/session/active');
    const s = res?.data;
    if (!s) return null;
    return {
      id: s.id ?? '',
      status: s.status ?? 'running',
      durationSeconds: s.durationSeconds ?? 300,
      progress: s.progress ?? 0,
      elapsedSeconds: s.elapsedSeconds ?? 0,
      remainingSeconds: s.remainingSeconds ?? 0,
      gladiators: (s.gladiators ?? []).map(mapGladiatorRow),
    };
  },

  /** Get final results for a completed session. */
  async getResults(sessionId: string): Promise<ArenaResults> {
    const res = await api.get<DataWrap<any>>(`/arena/session/${sessionId}/results`);
    const r = res?.data;
    return {
      winnerId: r?.winner?.botId ?? '',
      rankings: (r?.rankings ?? []).map(mapGladiatorRow),
      totalGladiators: r?.totalGladiators ?? 0,
      stats: r?.stats,
      session: r?.session,
    };
  },
};
