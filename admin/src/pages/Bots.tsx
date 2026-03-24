import { useState, useEffect, useCallback } from 'react';
import { Filter, X, Check, Ban, ShieldAlert, Eye, RotateCcw, Star, Trash2 } from 'lucide-react';
import { adminService, type Bot, type PaginatedResponse } from '../services/admin';

const BOT_STATUSES = ['all', 'draft', 'pending_review', 'approved', 'rejected', 'suspended'] as const;

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-white/[0.06] text-white/50 border-white/10',
    pending_review: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/15 text-red-400 border-red-500/20',
    suspended: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    processing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    analyzed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    error: 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const cls = colors[status] || colors.draft;
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const colors: Record<string, string> = {
    'very low': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    low: 'bg-lime-500/15 text-lime-400 border-lime-500/20',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    'very high': 'bg-red-500/15 text-red-400 border-red-500/20',
  };
  const key = (risk || 'medium').toLowerCase();
  const cls = colors[key] || colors.medium;
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border capitalize ${cls}`}>
      {risk || 'Medium'}
    </span>
  );
}

function BotAvatar({ name }: { name: string }) {
  const colors = [
    'bg-blue-500/15 text-blue-400',
    'bg-purple-500/15 text-purple-400',
    'bg-cyan-500/15 text-cyan-400',
    'bg-pink-500/15 text-pink-400',
    'bg-amber-500/15 text-amber-400',
    'bg-emerald-500/15 text-emerald-400',
  ];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colors[idx]}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'}
        />
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotDetailModal({ botId, onClose, onRefreshList: _onRefreshList }: { botId: string; onClose: () => void; onRefreshList: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getBotDetail(botId);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bot details');
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleDeleteReview = async (reviewId: string) => {
    setDeleteLoadingId(reviewId);
    setDeleteSuccess('');
    try {
      await adminService.deleteReview(reviewId);
      setDeleteSuccess('Review deleted');
      setTimeout(() => setDeleteSuccess(''), 3000);
      fetchDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete review');
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const bot = detail?.bot || detail;
  const stats = detail?.stats;
  const trainingFiles = detail?.trainingFiles || detail?.trainingUploads || [];
  const reviews = detail?.reviews || [];
  const activeSubscriptions = detail?.activeSubscriptions ?? detail?.subscriptionCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {bot && !loading && (
              <>
                <h3 className="text-white font-semibold text-lg">{bot.name}</h3>
                <StatusBadge status={bot.status} />
              </>
            )}
            {loading && <h3 className="text-white font-semibold text-lg">Loading...</h3>}
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {deleteSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-3 mb-4">
            {deleteSuccess}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 bg-white/5 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
            ))}
          </div>
        ) : bot ? (
          <div className="space-y-0">
            {/* Info Section */}
            <div className="pb-5 border-b border-white/[0.06]">
              <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Bot Information</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                <InfoRow label="Creator" value={bot.creatorName || bot.creatorId} />
                <InfoRow label="Email" value={bot.creatorEmail || '—'} />
                <InfoRow label="Strategy" value={bot.strategy || '—'} />
                <InfoRow label="Category" value={bot.category || '—'} />
                <InfoRow label="Risk Level" value={bot.riskLevel || 'Medium'} />
                <InfoRow label="Price" value={`$${parseFloat(bot.priceMonthly || '0').toFixed(2)}/mo`} />
                <InfoRow label="Version" value={bot.version || '1.0'} />
                <InfoRow label="Published" value={bot.isPublished ? 'Yes' : 'No'} />
                <InfoRow label="Created" value={new Date(bot.createdAt).toLocaleDateString()} />
              </div>
            </div>

            {/* Statistics Section */}
            {stats && (
              <div className="py-5 border-b border-white/[0.06]">
                <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Statistics</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="30d Return" value={stats.return30d != null ? `${parseFloat(stats.return30d).toFixed(2)}%` : '—'} />
                  <StatCard label="Win Rate" value={stats.winRate != null ? `${parseFloat(stats.winRate).toFixed(1)}%` : '—'} />
                  <StatCard label="Max Drawdown" value={stats.maxDrawdown != null ? `${parseFloat(stats.maxDrawdown).toFixed(2)}%` : '—'} />
                  <StatCard label="Sharpe Ratio" value={stats.sharpeRatio != null ? parseFloat(stats.sharpeRatio).toFixed(2) : '—'} />
                  <StatCard label="Active Users" value={stats.activeUsers ?? '—'} />
                  <StatCard label="Avg Rating" value={stats.avgRating != null ? parseFloat(stats.avgRating).toFixed(1) : '—'} />
                  <StatCard label="Review Count" value={stats.reviewCount ?? '—'} />
                </div>
              </div>
            )}

            {/* Training Files Section */}
            <div className="py-5 border-b border-white/[0.06]">
              <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Training Files</h4>
              {trainingFiles.length > 0 ? (
                <div className="space-y-2">
                  {trainingFiles.map((file: { id: string; name?: string; fileName?: string; type?: string; fileType?: string; status: string; analysisResult?: string; createdAt: string }) => (
                    <div key={file.id} className="bg-[#0D1117] border border-white/[0.06] rounded-lg px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white text-sm font-medium truncate">{file.name || file.fileName || 'Unnamed file'}</p>
                            <StatusBadge status={file.status} />
                          </div>
                          <p className="text-white/30 text-xs">
                            {file.type || file.fileType || 'Unknown type'} &middot; {new Date(file.createdAt).toLocaleDateString()}
                          </p>
                          {file.analysisResult && (
                            <p className="text-white/40 text-xs mt-1.5 line-clamp-2">
                              {typeof file.analysisResult === 'string'
                                ? file.analysisResult.slice(0, 200) + (file.analysisResult.length > 200 ? '...' : '')
                                : JSON.stringify(file.analysisResult).slice(0, 200)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/20 text-sm">No training data</p>
              )}
            </div>

            {/* Reviews Section */}
            <div className="py-5 border-b border-white/[0.06]">
              <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Reviews</h4>
              {reviews.length > 0 ? (
                <div className="space-y-2">
                  {reviews.map((review: { id: string; userName?: string; userEmail?: string; rating: number; reviewText?: string; comment?: string; createdAt: string }) => (
                    <div key={review.id} className="bg-[#0D1117] border border-white/[0.06] rounded-lg px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white text-sm font-medium">{review.userName || 'Anonymous'}</p>
                            <StarRating rating={review.rating} />
                          </div>
                          {(review.reviewText || review.comment) && (
                            <p className="text-white/50 text-sm mt-1">{review.reviewText || review.comment}</p>
                          )}
                          <p className="text-white/30 text-xs mt-1.5">{new Date(review.createdAt).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteReview(review.id)}
                          disabled={deleteLoadingId === review.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          <Trash2 size={13} />
                          {deleteLoadingId === review.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/20 text-sm">No reviews yet</p>
              )}
            </div>

            {/* Active Subscriptions */}
            <div className="pt-5">
              <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">Active Subscriptions</h4>
              <p className="text-white text-2xl font-bold">
                {typeof activeSubscriptions === 'number' ? activeSubscriptions : 0}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-white/30 text-xs">{label}: </span>
      <span className="text-white/80 text-sm">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#0D1117] border border-white/[0.06] rounded-lg px-3 py-2.5 text-center">
      <p className="text-white text-lg font-bold">{value}</p>
      <p className="text-white/30 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function Bots() {
  const [data, setData] = useState<PaginatedResponse<Bot> | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<Bot | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Detail modal
  const [detailBotId, setDetailBotId] = useState<string | null>(null);

  // Inline action loading
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const limit = 20;

  const fetchBots = useCallback(async (p: number, status: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getBots(p, limit, status === 'all' ? undefined : status);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots(page, statusFilter);
  }, [page, statusFilter, fetchBots]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleApprove = async (bot: Bot) => {
    setActionLoadingId(bot.id);
    setError('');
    try {
      await adminService.approveBot(bot.id);
      showSuccess(`"${bot.name}" has been approved`);
      fetchBots(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve bot');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSuspend = async (bot: Bot) => {
    setActionLoadingId(bot.id);
    setError('');
    try {
      await adminService.suspendBot(bot.id);
      showSuccess(`"${bot.name}" has been suspended`);
      fetchBots(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend bot');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (bot: Bot) => {
    setActionLoadingId(bot.id);
    setError('');
    try {
      await adminService.reactivateBot(bot.id);
      showSuccess(`"${bot.name}" has been reactivated`);
      fetchBots(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate bot');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRejectModal = (bot: Bot) => {
    setRejectTarget(bot);
    setRejectReason('');
    setModalError('');
  };

  const closeRejectModal = () => {
    setRejectTarget(null);
    setRejectReason('');
    setModalError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setModalLoading(true);
    setModalError('');
    try {
      await adminService.rejectBot(rejectTarget.id, rejectReason || undefined);
      closeRejectModal();
      showSuccess(`"${rejectTarget.name}" has been rejected`);
      fetchBots(page, statusFilter);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to reject bot');
    } finally {
      setModalLoading(false);
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bot Management</h1>
          <p className="text-white/40 text-sm mt-1">
            {data ? `${data.total} total bots` : 'Loading...'}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <select
            value={statusFilter}
            onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm appearance-none focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors cursor-pointer"
          >
            {BOT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-[#161B22]">
                {s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-3">
          {successMsg}
        </div>
      )}

      {/* Error message */}
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
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Bot</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Creator</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Strategy</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Risk Level</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Price</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
                        <div className="space-y-1.5">
                          <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
                          <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><div className="h-4 w-24 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-14 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-20 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((bot) => (
                  <tr key={bot.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <BotAvatar name={bot.name} />
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{bot.name}</p>
                          <p className="text-white/30 text-xs truncate">{bot.description || 'Trading Bot'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/70 text-sm truncate">{bot.creatorName || bot.creatorId}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/60 text-sm truncate">{bot.strategy || '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <RiskBadge risk={(bot as Record<string, unknown> & Bot).riskLevel as string || 'Medium'} />
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white text-sm font-medium">
                        ${parseFloat(bot.priceMonthly || '0').toFixed(2)}<span className="text-white/30 font-normal">/mo</span>
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={bot.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* View Details - always visible */}
                        <button
                          onClick={() => setDetailBotId(bot.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.06] text-white/50 border border-white/10 hover:bg-white/[0.1] hover:text-white/80 transition-colors"
                          title="View Details"
                        >
                          <Eye size={15} />
                        </button>

                        {bot.status === 'pending_review' && (
                          <>
                            <button
                              onClick={() => handleApprove(bot)}
                              disabled={actionLoadingId === bot.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Check size={14} />
                              Approve
                            </button>
                            <button
                              onClick={() => openRejectModal(bot)}
                              disabled={actionLoadingId === bot.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Ban size={14} />
                              Reject
                            </button>
                          </>
                        )}
                        {bot.status === 'approved' && (
                          <button
                            onClick={() => handleSuspend(bot)}
                            disabled={actionLoadingId === bot.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/20 hover:bg-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ShieldAlert size={14} />
                            Suspend
                          </button>
                        )}
                        {(bot.status === 'suspended' || bot.status === 'rejected') && (
                          <button
                            onClick={() => handleReactivate(bot)}
                            disabled={actionLoadingId === bot.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <RotateCcw size={14} />
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-white/20 text-sm">
                    {statusFilter !== 'all' ? `No bots with status "${statusFilter.replace(/_/g, ' ')}"` : 'No bots found'}
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

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeRejectModal} />
          <div className="relative bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg">Reject Bot</h3>
              <button
                onClick={closeRejectModal}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-white/40 text-sm mb-1">
              Rejecting <span className="text-white font-medium">"{rejectTarget.name}"</span>
            </p>
            <p className="text-white/30 text-xs mb-4">
              by {rejectTarget.creatorName || rejectTarget.creatorId}
            </p>

            {modalError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {modalError}
              </div>
            )}

            <label className="block text-white/50 text-sm font-medium mb-2">
              Rejection Reason
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this bot is being rejected..."
              rows={4}
              className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition-colors resize-none mb-6"
            />

            <div className="flex gap-3">
              <button
                onClick={closeRejectModal}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={modalLoading}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {modalLoading ? 'Rejecting...' : 'Reject Bot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bot Detail Modal */}
      {detailBotId && (
        <BotDetailModal
          botId={detailBotId}
          onClose={() => setDetailBotId(null)}
          onRefreshList={() => fetchBots(page, statusFilter)}
        />
      )}
    </div>
  );
}
