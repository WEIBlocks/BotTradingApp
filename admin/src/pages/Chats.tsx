import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MessageSquare, Search, ArrowLeft, User as UserIcon } from 'lucide-react';
import { adminService } from '../services/admin';

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

interface UserSummary {
  userId: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
}

// Deterministic avatar color from userId
const AVATAR_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
  '#EC4899', '#14B8A6', '#6366F1', '#F97316', '#06B6D4',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function formatTime(d: string): string {
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  } catch {
    return d;
  }
}

function formatBubbleTime(d: string): string {
  try {
    return new Date(d).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function formatDateSeparator(d: string): string {
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-red-500/15 text-red-400 border-red-500/20',
    creator: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    user: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };
  const cls = colors[role.toLowerCase()] || colors.user;
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {role}
    </span>
  );
}

export default function Chats() {
  // All messages fetched so far
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalMessages, setTotalMessages] = useState(0);

  // User list
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Mobile view toggle
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Chat panel
  const [userMessages, setUserMessages] = useState<ChatMessage[]>([]);
  const [loadingUserMsgs, setLoadingUserMsgs] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch all chats (paginate through to build user list)
  const fetchAllChats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accumulated: ChatMessage[] = [];
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const result = await adminService.getChats(page, limit);
        const msgs = result.data as ChatMessage[];
        accumulated.push(...msgs);
        setTotalMessages(result.total);
        if (page * limit >= result.total) {
          hasMore = false;
        } else {
          page++;
        }
        // Safety: cap at 10 pages (1000 messages) to avoid infinite loops
        if (page > 10) hasMore = false;
      }

      setAllMessages(accumulated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllChats();
  }, [fetchAllChats]);

  // Build user summaries from all messages
  const userSummaries = useMemo<UserSummary[]>(() => {
    const map = new Map<string, UserSummary>();

    for (const msg of allMessages) {
      const existing = map.get(msg.userId);
      if (!existing) {
        map.set(msg.userId, {
          userId: msg.userId,
          userName: msg.userName || 'Unknown User',
          userEmail: msg.userEmail || '',
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          messageCount: 1,
        });
      } else {
        existing.messageCount++;
        // Update to most recent message
        if (new Date(msg.createdAt) > new Date(existing.lastMessageTime)) {
          existing.lastMessage = msg.content;
          existing.lastMessageTime = msg.createdAt;
          // Also update name/email if available
          if (msg.userName) existing.userName = msg.userName;
          if (msg.userEmail) existing.userEmail = msg.userEmail;
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );
  }, [allMessages]);

  // Filtered user list
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return userSummaries;
    const q = searchQuery.toLowerCase();
    return userSummaries.filter(
      (u) =>
        u.userName.toLowerCase().includes(q) ||
        u.userEmail.toLowerCase().includes(q)
    );
  }, [userSummaries, searchQuery]);

  // Load messages for selected user
  const loadUserMessages = useCallback(
    async (userId: string) => {
      setLoadingUserMsgs(true);
      try {
        // Fetch all messages for this user
        const accumulated: ChatMessage[] = [];
        let page = 1;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
          const result = await adminService.getChats(page, limit, userId);
          const msgs = result.data as ChatMessage[];
          accumulated.push(...msgs);
          if (page * limit >= result.total) {
            hasMore = false;
          } else {
            page++;
          }
          if (page > 10) hasMore = false;
        }

        // Sort by time ascending for chat view
        accumulated.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setUserMessages(accumulated);
      } catch {
        setUserMessages([]);
      } finally {
        setLoadingUserMsgs(false);
      }
    },
    []
  );

  // When user is selected
  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setMobileShowChat(true);
    loadUserMessages(userId);
  };

  // Back button on mobile
  const handleBack = () => {
    setMobileShowChat(false);
    setSelectedUserId(null);
  };

  // Scroll to bottom when messages load
  useEffect(() => {
    if (chatEndRef.current && userMessages.length > 0) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [userMessages]);

  // Get selected user info
  const selectedUser = userSummaries.find((u) => u.userId === selectedUserId);

  // Group messages by date for separators
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';

    for (const msg of userMessages) {
      const dateStr = new Date(msg.createdAt).toDateString();
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({ date: msg.createdAt, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  }, [userMessages]);

  // Group messages by conversationId for visual separation
  const getConversationBreak = (msg: ChatMessage, idx: number): boolean => {
    if (idx === 0) return false;
    return userMessages[idx - 1].conversationId !== msg.conversationId;
  };

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <MessageSquare size={24} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Chat History</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">
          {loading
            ? 'Loading...'
            : `${totalMessages} messages from ${userSummaries.length} users`}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 shrink-0">
          {error}
        </div>
      )}

      {/* Two-Panel Layout */}
      <div className="flex gap-4 flex-1 min-h-0 h-[calc(100%-4rem)]">
        {/* Left Panel - User List */}
        <div
          className={`bg-[#161B22] border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden
            ${mobileShowChat ? 'hidden md:flex' : 'flex'}
            w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px]`}
        >
          {/* Search */}
          <div className="p-3 border-b border-white/[0.06] shrink-0">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full bg-[#0D1117] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
              />
            </div>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03]"
                >
                  <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-4 w-24 bg-white/5 rounded animate-pulse mb-1.5" />
                    <div className="h-3 w-40 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : filteredUsers.length === 0 ? (
              <div className="px-4 py-12 text-center text-white/20 text-sm">
                {searchQuery ? 'No users match your search' : 'No chat history found'}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.userId}
                  onClick={() => handleSelectUser(user.userId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] text-left transition-colors hover:bg-white/[0.04]
                    ${selectedUserId === user.userId ? 'bg-white/[0.06]' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ backgroundColor: getAvatarColor(user.userId) }}
                  >
                    {getInitials(user.userName)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-sm font-medium truncate">
                        {user.userName}
                      </span>
                      <span className="text-white/30 text-xs whitespace-nowrap shrink-0">
                        {formatTime(user.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-white/40 text-xs truncate">
                        {truncate(user.lastMessage, 50)}
                      </span>
                      <span className="bg-white/10 text-white/50 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0">
                        {user.messageCount}
                      </span>
                    </div>
                    {user.userEmail && (
                      <span className="text-white/20 text-[11px] truncate block mt-0.5">
                        {user.userEmail}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Chat View */}
        <div
          className={`bg-[#161B22] border border-white/[0.06] rounded-2xl flex flex-col overflow-hidden
            ${!mobileShowChat ? 'hidden md:flex' : 'flex'}
            w-full md:flex-1`}
        >
          {!selectedUserId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center">
                <MessageSquare size={28} className="text-white/20" />
              </div>
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">
                  Select a user to view their chat history
                </p>
                <p className="text-white/20 text-xs mt-1">
                  Choose from the list on the left
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0 bg-[#161B22]">
                {/* Back button on mobile */}
                <button
                  onClick={handleBack}
                  className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-white/[0.06] text-white/60 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>

                {selectedUser && (
                  <>
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: getAvatarColor(selectedUser.userId) }}
                    >
                      {getInitials(selectedUser.userName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">
                          {selectedUser.userName}
                        </span>
                        <RoleBadge role="user" />
                      </div>
                      <span className="text-white/30 text-xs truncate block">
                        {selectedUser.userEmail}
                      </span>
                    </div>
                    <span className="text-white/20 text-xs shrink-0">
                      {selectedUser.messageCount} messages
                    </span>
                  </>
                )}
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {loadingUserMsgs ? (
                  <div className="flex flex-col gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-3 animate-pulse bg-white/5 ${
                            i % 2 === 0 ? 'w-2/3' : 'w-1/2'
                          }`}
                          style={{ height: 60 + (i % 3) * 20 }}
                        />
                      </div>
                    ))}
                  </div>
                ) : userMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <UserIcon size={24} className="text-white/15" />
                    <p className="text-white/20 text-sm">No messages found</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {groupedMessages.map((group, gi) => (
                      <div key={gi}>
                        {/* Date Separator */}
                        <div className="flex items-center justify-center my-4">
                          <div className="bg-white/[0.06] text-white/30 text-[11px] font-medium px-3 py-1 rounded-full">
                            {formatDateSeparator(group.date)}
                          </div>
                        </div>

                        {group.messages.map((msg, mi) => {
                          const isUser = msg.role.toLowerCase() === 'user';
                          const globalIdx = userMessages.indexOf(msg);
                          const showConvBreak = getConversationBreak(msg, globalIdx);

                          return (
                            <div key={msg.id}>
                              {/* Conversation break indicator */}
                              {showConvBreak && (
                                <div className="flex items-center gap-3 my-3">
                                  <div className="flex-1 h-px bg-white/[0.06]" />
                                  <span className="text-white/20 text-[10px] font-medium uppercase tracking-wider">
                                    New conversation
                                  </span>
                                  <div className="flex-1 h-px bg-white/[0.06]" />
                                </div>
                              )}

                              {/* Message Bubble */}
                              <div
                                className={`flex mb-1.5 ${
                                  isUser ? 'justify-start' : 'justify-end'
                                }`}
                              >
                                <div
                                  className={`max-w-[75%] lg:max-w-[60%] rounded-2xl px-4 py-2.5 ${
                                    isUser
                                      ? 'bg-[#21262D] text-white/90 rounded-bl-md'
                                      : 'bg-[#10B981]/20 text-[#6EE7B7] rounded-br-md'
                                  }`}
                                >
                                  {/* Role label */}
                                  <div
                                    className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                                      isUser ? 'text-blue-400/60' : 'text-[#10B981]/60'
                                    }`}
                                  >
                                    {isUser ? 'User' : 'AI Assistant'}
                                  </div>

                                  {/* Content */}
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.content}
                                  </p>

                                  {/* Timestamp */}
                                  <div
                                    className={`text-[10px] mt-1.5 ${
                                      isUser ? 'text-white/25' : 'text-[#10B981]/40'
                                    }`}
                                  >
                                    {formatBubbleTime(msg.createdAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
