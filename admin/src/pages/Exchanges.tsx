import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { adminService, type Exchange, type PaginatedResponse } from '../services/admin';

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    binance: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    coinbase: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    kraken: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    bybit: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    kucoin: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  };
  const cls = colors[provider.toLowerCase()] || 'bg-white/[0.06] text-white/50 border-white/10';
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {provider}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    disconnected: 'bg-white/[0.06] text-white/40 border-white/10',
    syncing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    error: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const cls = colors[status] || colors.disconnected;
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '\u2014';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function formatRelativeTime(d: string | null) {
  if (!d) return '\u2014';
  try {
    const now = Date.now();
    const then = new Date(d).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return formatDate(d);
  } catch {
    return d;
  }
}

export default function Exchanges() {
  const [data, setData] = useState<PaginatedResponse<Exchange> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const limit = 20;

  const fetchExchanges = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getExchanges(p, limit);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exchanges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExchanges(page);
  }, [page, fetchExchanges]);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight size={22} className="text-[#10B981]" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Exchange Connections</h1>
          </div>
          <p className="text-white/40 text-sm mt-1">
            {data ? `${data.total} total connections` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Provider</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Last Sync</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Connected</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="space-y-1.5">
                        <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-36 bg-white/5 rounded animate-pulse" />
                      </div>
                    </td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-20 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((ex) => (
                  <tr key={ex.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{ex.userName || 'Unknown'}</p>
                        <p className="text-white/30 text-xs truncate">{ex.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ProviderBadge provider={ex.provider} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ex.status} />
                    </td>
                    <td className="px-5 py-3 text-white/50 text-sm">
                      {formatRelativeTime(ex.lastSyncAt)}
                    </td>
                    <td className="px-5 py-3 text-white/40 text-sm">
                      {formatDate(ex.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-white/20 text-sm">
                    No exchange connections found
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
