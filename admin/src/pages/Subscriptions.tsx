import { useState, useEffect, useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import { adminService, type Subscription, type PaginatedResponse } from '../services/admin';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
    past_due: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    trialing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };
  const cls = colors[status] || colors.active;
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {label}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
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

export default function Subscriptions() {
  const [data, setData] = useState<PaginatedResponse<Subscription> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const limit = 20;

  const fetchSubscriptions = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getSubscriptions(p, limit);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions(page);
  }, [page, fetchSubscriptions]);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CreditCard size={22} className="text-[#10B981]" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Subscriptions & Payments</h1>
          </div>
          <p className="text-white/40 text-sm mt-1">
            {data ? `${data.total} total subscriptions` : 'Loading...'}
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
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Plan</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Price</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Period</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Created</th>
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
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-14 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-32 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((sub) => (
                  <tr key={sub.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{sub.userName || 'Unknown'}</p>
                        <p className="text-white/30 text-xs truncate">{sub.userId}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/70 text-sm font-medium capitalize">{sub.planName}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white text-sm font-medium">
                        ${sub.planPrice ?? '0.00'}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/50 text-sm">
                        {formatDate(sub.currentPeriodStart)}
                        <span className="text-white/20 mx-1.5">&rarr;</span>
                        {formatDate(sub.currentPeriodEnd)}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-white/40 text-sm">
                      {formatDate(sub.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/20 text-sm">
                    No subscriptions found
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
