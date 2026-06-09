import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Activity, Brain } from 'lucide-react';
import api from '../services/api';

interface TrainerBotStatus {
  botId: string;
  botName: string;
  trainerScore: number | null;
  trainerStatus: string;
  lastRetrainAt: string | null;
  totalTrades: number;
  winRate: number;
  needsAttention: boolean;
}

function ScoreRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 70 ? '#10B981' : s >= 50 ? '#F59E0B' : '#EF4444';
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = (s / 100) * circ;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>{score ?? '—'}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    retraining: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    shadow_validating: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    monitoring: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    needs_attention: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const cls = map[status] ?? 'bg-white/5 text-white/40 border-white/10';
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function Trainer() {
  const [bots, setBots] = useState<TrainerBotStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrainingId, setRetrainingId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/trainer/statuses');
      setBots((res.data as any)?.data ?? []);
      setLastRefresh(new Date());
    } catch {
      // endpoint may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retrain = async (botId: string) => {
    setRetrainingId(botId);
    try {
      await api.post(`/bots/${botId}/trainer/retrain`, {});
      await load();
    } catch { /* ignore */ }
    finally { setRetrainingId(null); }
  };

  const needsAttention = bots.filter(b => b.needsAttention);
  const healthy = bots.filter(b => !b.needsAttention);
  const avgScore = bots.length
    ? Math.round(bots.reduce((s, b) => s + (b.trainerScore ?? 0), 0) / bots.length)
    : null;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-white/40 text-xs font-medium mb-1">Total Bots</p>
          <p className="text-2xl font-bold text-white">{bots.length}</p>
        </div>
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-white/40 text-xs font-medium mb-1">Avg Health Score</p>
          <p className={`text-2xl font-bold ${(avgScore ?? 0) >= 70 ? 'text-emerald-400' : (avgScore ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {avgScore ?? '—'}<span className="text-sm font-normal text-white/30">/100</span>
          </p>
        </div>
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-white/40 text-xs font-medium mb-1">Needs Attention</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${needsAttention.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {needsAttention.length}
            </p>
            {needsAttention.length > 0 && <AlertTriangle size={16} className="text-red-400" />}
          </div>
        </div>
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-white/40 text-xs font-medium mb-1">Currently Retraining</p>
          <p className="text-2xl font-bold text-violet-400">
            {bots.filter(b => b.trainerStatus === 'retraining').length}
          </p>
        </div>
      </div>

      {/* Needs attention section */}
      {needsAttention.length > 0 && (
        <div className="bg-[#161B22] border border-red-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={16} className="text-red-400" />
            <h2 className="text-base font-semibold text-red-400">Needs Attention ({needsAttention.length})</h2>
          </div>
          <div className="space-y-3">
            {needsAttention.map(b => (
              <BotRow key={b.botId} bot={b} retrainingId={retrainingId} onRetrain={retrain} />
            ))}
          </div>
        </div>
      )}

      {/* All bots */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-violet-400" />
            <h2 className="text-lg font-semibold text-white">All Bots</h2>
            {lastRefresh && (
              <span className="text-white/25 text-xs ml-2">
                refreshed {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <RefreshCw size={16} className="animate-spin text-violet-400" />
            <p className="text-white/40 text-sm">Loading trainer statuses…</p>
          </div>
        ) : bots.length === 0 ? (
          <div className="text-center py-12">
            <Brain size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No approved bots found</p>
            <p className="text-white/20 text-xs mt-1">Trainer activates after bots are approved.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map(b => (
              <BotRow key={b.botId} bot={b} retrainingId={retrainingId} onRetrain={retrain} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BotRow({
  bot: b,
  retrainingId,
  onRetrain,
}: {
  bot: TrainerBotStatus;
  retrainingId: string | null;
  onRetrain: (id: string) => void;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${b.needsAttention ? 'border-red-500/20 bg-red-500/[0.03]' : 'border-white/[0.05] bg-white/[0.02]'}`}>
      <ScoreRing score={b.trainerScore} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white text-sm font-semibold truncate">{b.botName}</p>
          {b.needsAttention && <AlertTriangle size={12} className="text-red-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-white/40">
            <Activity size={11} />
            {b.totalTrades} trades
          </span>
          <span className="flex items-center gap-1 text-xs text-white/40">
            {b.winRate >= 50
              ? <TrendingUp size={11} className="text-emerald-400" />
              : <TrendingDown size={11} className="text-red-400" />}
            WR {b.winRate.toFixed(0)}%
          </span>
          {b.lastRetrainAt && (
            <span className="text-xs text-white/25">
              retrained {new Date(b.lastRetrainAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <StatusBadge status={b.trainerStatus} />

      <button
        disabled={!!retrainingId || b.trainerStatus === 'retraining'}
        onClick={() => onRetrain(b.botId)}
        className="flex items-center gap-1.5 text-xs text-violet-400 border border-violet-400/30 rounded-lg px-3 py-1.5 hover:bg-violet-400/10 transition-colors disabled:opacity-40 shrink-0"
      >
        <Zap size={12} />
        {retrainingId === b.botId ? 'Running…' : 'Retrain'}
      </button>
    </div>
  );
}
