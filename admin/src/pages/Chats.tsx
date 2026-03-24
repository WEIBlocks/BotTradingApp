import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { adminService, type PaginatedResponse } from '../services/admin';

interface ChatMessage {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: string;
  content: string;
  conversationId: string;
  createdAt: string;
}

function RoleBadge({ role }: { role: string }) {
  const isUser = role.toLowerCase() === 'user';
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border ${
        isUser
          ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
          : 'bg-purple-500/15 text-purple-400 border-purple-500/20'
      }`}
    >
      {role}
    </span>
  );
}

export default function Chats() {
  const [data, setData] = useState<PaginatedResponse<ChatMessage> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter
  const [userIdFilter, setUserIdFilter] = useState('');
  const [appliedUserId, setAppliedUserId] = useState<string | undefined>();

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const limit = 20;

  const fetchChats = useCallback(async (p: number, userId?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getChats(p, limit, userId);
      setData(result as PaginatedResponse<ChatMessage>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats(page, appliedUserId);
  }, [page, appliedUserId, fetchChats]);

  const handleApplyFilter = () => {
    setPage(1);
    setAppliedUserId(userIdFilter.trim() || undefined);
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

  const truncate = (str: string, max: number) => {
    if (str.length <= max) return str;
    return str.slice(0, max) + '...';
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <MessageSquare size={24} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Chat History</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">
          {data ? `${data.total} total messages` : 'Loading...'}
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
        <button
          onClick={handleApplyFilter}
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
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3 w-8"></th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Role</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Content</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Conversation ID</th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3"><div className="h-4 w-4 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-24 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-64 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-28 bg-white/5 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((msg) => (
                  <>
                    <tr
                      key={msg.id}
                      onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                      className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 text-white/30">
                        {expandedId === msg.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                      <td className="px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{msg.userName || msg.userId}</p>
                          {msg.userEmail && (
                            <p className="text-white/30 text-xs truncate">{msg.userEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <RoleBadge role={msg.role} />
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-white/60 text-sm">{truncate(msg.content, 100)}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-white/30 text-xs font-mono">{truncate(msg.conversationId, 12)}</span>
                      </td>
                      <td className="px-5 py-3 text-white/40 text-sm whitespace-nowrap">
                        {formatDate(msg.createdAt)}
                      </td>
                    </tr>
                    {expandedId === msg.id && (
                      <tr key={`${msg.id}-expanded`} className="border-b border-white/[0.03]">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="bg-[#0D1117] border border-white/[0.06] rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <RoleBadge role={msg.role} />
                              <span className="text-white/30 text-xs font-mono">Conv: {msg.conversationId}</span>
                            </div>
                            <p className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-white/20 text-sm">
                    No chat messages found
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
