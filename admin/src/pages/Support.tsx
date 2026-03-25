import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LifeBuoy,
  Search,
  Send,
  X,
  Clock,
  User,
  AlertCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Bug,
  Lightbulb,
  Ticket,
} from 'lucide-react';
import { adminService } from '../services/admin';

// ── Types ──────────────────────────────────────────────────────────

interface SupportTicket {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  title: string;
  description: string;
  type: string; // support | bug_report | feature_request
  status: string; // open | in_progress | resolved | closed
  priority: string; // low | normal | high | critical
  createdAt: string;
  updatedAt: string;
}

interface TicketMessage {
  id: string;
  ticketId: string;
  userId: string;
  userName?: string;
  role: string; // user | admin
  content: string;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'open', 'in_progress', 'resolved', 'closed'] as const;
const TYPE_OPTIONS = ['all', 'support', 'bug_report', 'feature_request'] as const;

function statusColor(s: string) {
  switch (s) {
    case 'open':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'in_progress':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20';
    case 'resolved':
      return 'bg-green-500/15 text-green-400 border-green-500/20';
    case 'closed':
      return 'bg-white/10 text-white/40 border-white/10';
    default:
      return 'bg-white/10 text-white/50 border-white/10';
  }
}

function priorityColor(p: string) {
  switch (p) {
    case 'low':
      return 'bg-white/10 text-white/40 border-white/10';
    case 'normal':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'high':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'critical':
      return 'bg-red-500/15 text-red-400 border-red-500/20';
    default:
      return 'bg-white/10 text-white/50 border-white/10';
  }
}

function typeIcon(t: string) {
  switch (t) {
    case 'bug_report':
      return <Bug size={16} className="text-red-400 shrink-0" />;
    case 'feature_request':
      return <Lightbulb size={16} className="text-yellow-400 shrink-0" />;
    default:
      return <Ticket size={16} className="text-blue-400 shrink-0" />;
  }
}

function typeLabel(t: string) {
  switch (t) {
    case 'bug_report':
      return 'Bug Report';
    case 'feature_request':
      return 'Feature Request';
    default:
      return 'Support';
  }
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string) {
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
}

function formatShortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function Support() {
  // Ticket list state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Selected ticket
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Reply
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Notify modal
  const [notifyModal, setNotifyModal] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifySending, setNotifySending] = useState(false);

  // Mobile detail view
  const [showDetail, setShowDetail] = useState(false);

  // ── Fetch tickets ───────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: { page: number; limit: number; status?: string; type?: string } = { page, limit };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      const result = await adminService.getTickets(params);
      const list = result.data ?? result;
      setTickets(Array.isArray(list) ? list : list.data ?? []);
      setTotalTickets(result.pagination?.total ?? result.total ?? (Array.isArray(list) ? list.length : 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // ── Fetch messages ──────────────────────────────────────────────

  const fetchMessages = useCallback(async (ticketId: string) => {
    setMessagesLoading(true);
    try {
      const result = await adminService.getTicketMessages(ticketId);
      const msgs = result.messages ?? result.data?.messages ?? result.data ?? result;
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Actions ─────────────────────────────────────────────────────

  const handleSelectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReplyText('');
    setShowDetail(true);
  };

  const handleReply = async (closeAfter = false) => {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);
    try {
      await adminService.replyToTicket(selectedTicket.id, replyText.trim());
      if (closeAfter) {
        await adminService.updateTicketStatus(selectedTicket.id, 'closed');
        setSelectedTicket({ ...selectedTicket, status: 'closed' });
      }
      setReplyText('');
      fetchMessages(selectedTicket.id);
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedTicket) return;
    try {
      await adminService.updateTicketStatus(selectedTicket.id, status);
      setSelectedTicket({ ...selectedTicket, status });
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!selectedTicket) return;
    try {
      await adminService.updateTicketStatus(selectedTicket.id, selectedTicket.status, priority);
      setSelectedTicket({ ...selectedTicket, priority });
      fetchTickets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update priority');
    }
  };

  const handleNotify = async () => {
    if (!selectedTicket || !notifyTitle.trim() || !notifyBody.trim()) return;
    setNotifySending(true);
    try {
      await adminService.sendDirectNotification(selectedTicket.userId, notifyTitle.trim(), notifyBody.trim());
      setNotifyModal(false);
      setNotifyTitle('');
      setNotifyBody('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setNotifySending(false);
    }
  };

  const totalPages = Math.ceil(totalTickets / limit) || 1;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <LifeBuoy size={24} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Support Tickets</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">
          {loading ? 'Loading...' : `${totalTickets} total tickets`}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4 shrink-0">
          {error}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Panel - Ticket List */}
        <div
          className={`${
            showDetail ? 'hidden lg:flex' : 'flex'
          } flex-col w-full lg:w-[420px] lg:shrink-0 bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden`}
        >
          {/* Status Tabs */}
          <div className="flex border-b border-white/[0.06] shrink-0 overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setStatusFilter(tab);
                  setPage(1);
                }}
                className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab
                    ? 'text-[#10B981] border-b-2 border-[#10B981]'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {statusLabel(tab)}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="px-3 py-2 border-b border-white/[0.06] shrink-0">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#10B981]/50"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All Types' : typeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-white/[0.03]">
                  <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse mb-2" />
                  <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
                </div>
              ))
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/20">
                <LifeBuoy size={40} className="mb-3" />
                <p className="text-sm">No support tickets yet</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`w-full text-left px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors ${
                    selectedTicket?.id === ticket.id ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {typeIcon(ticket.type)}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{ticket.title}</p>
                      <p className="text-white/30 text-xs truncate mt-0.5">
                        {ticket.userName || ticket.userEmail || ticket.userId}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor(
                            ticket.status
                          )}`}
                        >
                          {statusLabel(ticket.status)}
                        </span>
                        <span
                          className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${priorityColor(
                            ticket.priority
                          )}`}
                        >
                          {ticket.priority}
                        </span>
                        <span className="text-white/20 text-[10px]">{formatShortDate(ticket.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] shrink-0">
              <span className="text-white/30 text-xs">
                {page} / {totalPages}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Ticket Detail */}
        <div
          className={`${
            showDetail ? 'flex' : 'hidden lg:flex'
          } flex-col flex-1 bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden min-w-0`}
        >
          {selectedTicket ? (
            <>
              {/* Detail Header */}
              <div className="px-5 py-4 border-b border-white/[0.06] shrink-0">
                <div className="flex items-start gap-3">
                  {/* Mobile back button */}
                  <button
                    onClick={() => setShowDetail(false)}
                    className="lg:hidden p-1 rounded hover:bg-white/10 transition-colors shrink-0 mt-0.5"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {typeIcon(selectedTicket.type)}
                      <span className="text-white/30 text-xs">{typeLabel(selectedTicket.type)}</span>
                    </div>
                    <h2 className="text-white text-lg font-semibold truncate">{selectedTicket.title}</h2>
                    <div className="flex items-center gap-2 mt-1 text-white/40 text-xs">
                      <User size={12} />
                      <span>
                        {selectedTicket.userName || selectedTicket.userId}
                        {selectedTicket.userEmail ? ` (${selectedTicket.userEmail})` : ''}
                      </span>
                      <Clock size={12} className="ml-2" />
                      <span>{formatDate(selectedTicket.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Priority dropdowns + quick actions */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="bg-[#0D1117] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#10B981]/50"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select
                    value={selectedTicket.priority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    className="bg-[#0D1117] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#10B981]/50"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <button
                    onClick={() => setNotifyModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Bell size={12} />
                    Notify User
                  </button>
                </div>
              </div>

              {/* Description */}
              {selectedTicket.description && (
                <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
                  <p className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-1">Description</p>
                  <p className="text-white/70 text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedTicket.description}
                  </p>
                </div>
              )}

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messagesLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <div className="h-16 w-2/3 bg-white/5 rounded-xl animate-pulse" />
                    </div>
                  ))
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/20">
                    <AlertCircle size={32} className="mb-2" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.isAdmin === true || msg.is_admin === true || msg.role === 'admin';
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                            isAdmin
                              ? 'bg-[#10B981]/20 border border-[#10B981]/20'
                              : 'bg-[#0D1117] border border-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-medium ${isAdmin ? 'text-[#10B981]' : 'text-white/60'}`}
                            >
                              {msg.userName || (isAdmin ? 'Admin' : 'User')}
                            </span>
                            <span className="text-white/20 text-[10px]">{formatDate(msg.createdAt)}</span>
                          </div>
                          <p className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className="px-5 py-3 border-t border-white/[0.06] shrink-0">
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={2}
                    className="flex-1 bg-[#0D1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleReply();
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleReply(false)}
                    disabled={!replyText.trim() || sending}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={14} />
                    {sending ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    onClick={() => handleReply(true)}
                    disabled={!replyText.trim() || sending}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Send & Close
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* No ticket selected */
            <div className="flex-1 flex flex-col items-center justify-center text-white/20">
              <LifeBuoy size={48} className="mb-3" />
              <p className="text-sm">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Notify User Modal */}
      {notifyModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold">Notify User</h3>
              <button
                onClick={() => setNotifyModal(false)}
                className="p-1 rounded hover:bg-white/10 transition-colors text-white/40 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-white/40 text-xs">
                Send a notification to {selectedTicket.userName || selectedTicket.userEmail || selectedTicket.userId}
              </p>
              <div>
                <label className="text-white/50 text-xs font-medium mb-1 block">Title</label>
                <input
                  type="text"
                  value={notifyTitle}
                  onChange={(e) => setNotifyTitle(e.target.value)}
                  placeholder="Notification title..."
                  className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs font-medium mb-1 block">Message</label>
                <textarea
                  value={notifyBody}
                  onChange={(e) => setNotifyBody(e.target.value)}
                  placeholder="Notification message..."
                  rows={3}
                  className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
              <button
                onClick={() => setNotifyModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNotify}
                disabled={!notifyTitle.trim() || !notifyBody.trim() || notifySending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Bell size={14} />
                {notifySending ? 'Sending...' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
