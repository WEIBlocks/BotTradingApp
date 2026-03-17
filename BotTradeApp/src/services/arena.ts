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
}

export interface ArenaResults {
  winnerId: string;
  rankings: Gladiator[];
  totalGladiators: number;
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
  };
}

function mapGladiatorRow(g: GladiatorRow): Gladiator {
  return {
    id: g.botId,
    name: g.botName ?? 'Unknown',
    strategy: g.botStrategy ?? '',
    statLabel: g.isWinner ? 'Champion' : `Rank #${g.rank ?? '?'}`,
    winRate: parseFloat(g.winRate ?? '0') || 0,
    level: Math.floor((parseFloat(g.finalReturn ?? '0') || 0) + 20),
    avatarColor: g.botColor ?? '#6C63FF',
    selected: true,
    currentReturn: parseFloat(g.finalReturn ?? '0') || 0,
    equityData: Array.isArray(g.equityData) ? g.equityData : [],
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
  async createSession(botIds: string[], durationSeconds = 300): Promise<ArenaSession> {
    const res = await api.post<DataWrap<SessionResponse>>('/arena/session', {
      botIds, durationSeconds,
    } as Record<string, unknown>);
    const s = res?.data;
    return {
      id: s?.id ?? '',
      status: s?.status ?? 'running',
      durationSeconds: s?.durationSeconds ?? durationSeconds,
      progress: s?.progress ?? 0,
      elapsedSeconds: s?.elapsedSeconds ?? 0,
      remainingSeconds: s?.remainingSeconds ?? durationSeconds,
      gladiators: (s?.gladiators ?? []).map(mapGladiatorRow),
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
    };
  },

  /** Get final results for a completed session. */
  async getResults(sessionId: string): Promise<ArenaResults> {
    const res = await api.get<DataWrap<ResultsResponse>>(`/arena/session/${sessionId}/results`);
    const r = res?.data;
    return {
      winnerId: r?.winner?.botId ?? '',
      rankings: (r?.rankings ?? []).map(mapGladiatorRow),
      totalGladiators: r?.totalGladiators ?? 0,
    };
  },
};
