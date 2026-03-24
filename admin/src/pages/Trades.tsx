import { useState, useEffect, useCallback } from 'react';
import { Activity, Search } from 'lucide-react';
import { adminService, type PaginatedResponse } from '../services/admin';

interface Trade {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  botId: string;
  botName?: string;
  symbol: string;
  side: string;
  amount: string;
  price: string;
  totalValue: string;
  pnl: string | null;
  status: string;
  isPaper: boolean;
  createdAt: string;
}

function SideBadge({ side }: { side: string }) {
  const isBuy = side.toUpperCase() === 'BUY';
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border ${
        isBuy
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
          : 'bg-red-500/15 text-red-400 border-red-500/20'
      }`}
    >
      {side.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    executed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    filled: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    open: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    cancelled: 'bg-white/[0.06] text-white/50 border-white/10',
    failed: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const cls = colors[status.toLowerCase()] || colors.pending;
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {status}
    </span>
  );
}

export default function Trades() {
  const [data, setData] = useState<PaginatedResponse<Trade> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [userIdFilter, setUserIdFilter] = useState('');
  const [botIdFilter, setBotIdFilter] = useState('');
  const [appliedUserId, setAppliedUserId] = useState<string | undefined>();
  const [appliedBotId, setAppliedBotId] = useState<string | undefined>();

  const limit = 20;

  const fetchTrades = useCallback(async (p: number, userId?: string, botId?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getTrades(p, limit, userId, botId);
      setData(result as PaginatedResponse<Trade>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades(page, appliedUserId, appliedBotId);
  }, [page, appliedUserId, appliedBotId, fetchTrades]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedUserId(userIdFilter.trim() || undefined);
    setAppliedBotId(botIdFilter.trim() || undefined);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const formatCurrency = (val: string | null | undefined) => {
    if (!val) return '—';
    const n = parseFloat(val);
    if (isNaN(n)) return val;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPnl = (val: string | null) => {
    if (!val) return <span className="text-white/30">—</span>;
    const n = parseFloat(val);
    if (isNaN(n)) return <span className="text-white/50">{val}</span>;
    const color = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white/50';
    const prefix = n > 0 ? '+' : '';
    return (
      <span className={`font-medium ${color}`}>
        {prefix}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    );
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Activity size={24} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Trade History</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">
          {data ? `${data.total} total trades` : 'Loading...'}
        </p>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
            placeholder="Filter by User ID..."
            className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
          />
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={botIdFilter}
            onChange={(e) => setBotIdFilter(e.target.value)}
            placeholder="Filter by Bot ID..."
            className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
          />
        </div>
        <button
          onClick={handleApplyFilters}
          className="px-5 py-2 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium transition-colors shrink-0"
        >
          Apply
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Symbol</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Side</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Amount</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Price</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Total Value</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">P&L</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-center text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Paper?</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3"><div className="h-4 w-24 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-12 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-8 bg-white/5 rounded animate-pulse mx-auto" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-28 bg-white/5 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((trade) => (
                  <tr key={trade.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{trade.userName || trade.userId}</p>
                        {trade.userEmail && (
                          <p className="text-white/30 text-xs truncate">{trade.userEmail}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-white text-sm font-medium">{trade.symbol}</span>
                    </td>
                    <td className="px-5 py-3">
                      <SideBadge side={trade.side} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-white/70 text-sm">{parseFloat(trade.amount).toLocaleString('en-US')}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-white/70 text-sm">{formatCurrency(trade.price)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-white text-sm font-medium">{formatCurrency(trade.totalValue)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {formatPnl(trade.pnl)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs font-medium ${trade.isPaper ? 'text-yellow-400' : 'text-white/30'}`}>
                        {trade.isPaper ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/40 text-sm whitespace-nowrap">
                      {formatDate(trade.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-white/20 text-sm">
                    No trades found
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
