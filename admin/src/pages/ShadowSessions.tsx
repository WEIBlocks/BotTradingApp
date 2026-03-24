import { useState, useEffect, useCallback } from 'react';
import { Eye } from 'lucide-react';
import { adminService, type PaginatedResponse } from '../services/admin';

interface ShadowSession {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  botId: string;
  botName?: string;
  virtualBalance: string;
  currentBalance: string;
  status: string;
  startDate: string;
  endDate: string;
  totalTrades: number;
  winCount: number;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    active: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    paused: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const cls = colors[status.toLowerCase()] || 'bg-white/[0.06] text-white/50 border-white/10';
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {status}
    </span>
  );
}

export default function ShadowSessions() {
  const [data, setData] = useState<PaginatedResponse<ShadowSession> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const limit = 20;

  const fetchSessions = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getShadowSessions(p, limit);
      setData(result as PaginatedResponse<ShadowSession>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shadow sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(page);
  }, [page, fetchSessions]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const formatCurrency = (val: string | null | undefined) => {
    if (!val) return '$0.00';
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const calcPnl = (current: string, virtual: string) => {
    const c = parseFloat(current);
    const v = parseFloat(virtual);
    if (isNaN(c) || isNaN(v)) return { value: 0, formatted: '—', color: 'text-white/30' };
    const diff = c - v;
    const color = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white/50';
    const prefix = diff > 0 ? '+' : '';
    const formatted = `${prefix}$${diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return { value: diff, formatted, color };
  };

  const calcDuration = (start: string, end: string) => {
    try {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      const days = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
      return days > 0 ? `${days}d` : '< 1d';
    } catch {
      return '—';
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Eye size={24} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Shadow Sessions</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">
          {data ? `${data.total} total sessions` : 'Loading...'}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Bot</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Virtual Balance</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Current Balance</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">P&L</th>
                <th className="text-center text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Duration</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Started</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Ends</th>
                <th className="text-center text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Trades</th>
                <th className="text-center text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Wins</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3"><div className="h-4 w-24 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-10 bg-white/5 rounded animate-pulse mx-auto" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-8 bg-white/5 rounded animate-pulse mx-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-8 bg-white/5 rounded animate-pulse mx-auto" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((session) => {
                  const pnl = calcPnl(session.currentBalance, session.virtualBalance);
                  return (
                    <tr key={session.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{session.userName || session.userId}</p>
                          {session.userEmail && (
                            <p className="text-white/30 text-xs truncate">{session.userEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-white/70 text-sm truncate">{session.botName || session.botId}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-white/70 text-sm">{formatCurrency(session.virtualBalance)}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-white text-sm font-medium">{formatCurrency(session.currentBalance)}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-medium ${pnl.color}`}>{pnl.formatted}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-white/50 text-sm">{calcDuration(session.startDate, session.endDate)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={session.status} />
                      </td>
                      <td className="px-5 py-3 text-white/40 text-sm whitespace-nowrap">
                        {formatDate(session.startDate)}
                      </td>
                      <td className="px-5 py-3 text-white/40 text-sm whitespace-nowrap">
                        {formatDate(session.endDate)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-white/70 text-sm">{session.totalTrades}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-emerald-400 text-sm font-medium">{session.winCount}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-white/20 text-sm">
                    No shadow sessions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <span className="text-white/30 text-sm">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
