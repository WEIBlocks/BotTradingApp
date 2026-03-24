import api from './api';

// ── Types matching actual backend responses ──────────────────────

export interface DashboardData {
  revenue: {
    totalRevenue: string;
    totalTransactions: number;
    monthly: { month: string; revenue: string; transactions: number }[];
  };
  trades: {
    totalTrades: number;
    buyCount: number;
    sellCount: number;
    paperCount: number;
    liveCount: number;
  };
  users: {
    totalUsers: number;
    activeUsers: number;
    adminCount: number;
    creatorCount: number;
    newThisMonth: number;
  };
  totalBots: number;
  activeSubscriptions: number;
}

export interface RevenueAnalytics {
  totalRevenue: string;
  totalTransactions: number;
  monthly: { month: string; revenue: string; transactions: number }[];
}

export interface TradeAnalytics {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  paperCount: number;
  liveCount: number;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  adminCount: number;
  creatorCount: number;
  newThisMonth: number;
}

export interface SystemHealth {
  status: string;
  services: {
    database: string;
    redis: string;
  };
  timestamp: string;
}

// ── Users ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
  // Computed helpers
  total: number;
  totalPages: number;
}

function normalizePaginated<T>(raw: { data: T[]; pagination: { page: number; limit: number; total: number } }): PaginatedResponse<T> {
  const { data, pagination } = raw;
  return {
    data,
    pagination,
    total: pagination.total,
    totalPages: Math.ceil(pagination.total / pagination.limit) || 1,
  };
}

// ── Bots ───────────────────────────────────────────────────────────

export interface Bot {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  creatorId: string;
  creatorName?: string;
  creatorEmail?: string;
  status: string;
  strategy: string;
  category: string | null;
  riskLevel: string | null;
  priceMonthly: string;
  isPublished: boolean;
  avatarColor: string | null;
  avatarLetter: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}

// ── Subscriptions ──────────────────────────────────────────────────

export interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName?: string;
  planPrice?: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

// ── Exchanges ──────────────────────────────────────────────────────

export interface Exchange {
  id: string;
  provider: string;
  method: string;
  status: string;
  totalBalance: string;
  lastSyncAt: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
}

// ── Settings ───────────────────────────────────────────────────────

export interface SystemSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  maxBotsPerCreator: number;
  defaultCommissionRate: number;
  minWithdrawalAmount: number;
  supportEmail: string;
  [key: string]: unknown;
}

// ── Notifications ──────────────────────────────────────────────────

export interface SendNotificationPayload {
  target: 'all' | 'subscribers' | 'creators';
  title: string;
  body: string;
  priority?: 'low' | 'normal' | 'high';
}

// ── Admin Service ──────────────────────────────────────────────────

export const adminService = {
  // Analytics
  async getDashboard(): Promise<DashboardData> {
    const { data } = await api.get('/admin/analytics/dashboard');
    return data.data ?? data;
  },

  async getRevenueAnalytics(): Promise<RevenueAnalytics> {
    const { data } = await api.get('/admin/analytics/revenue');
    return data.data ?? data;
  },

  async getTradeAnalytics(): Promise<TradeAnalytics> {
    const { data } = await api.get('/admin/analytics/trades');
    return data.data ?? data;
  },

  async getUserAnalytics(): Promise<UserAnalytics> {
    const { data } = await api.get('/admin/analytics/users');
    return data.data ?? data;
  },

  // Users
  async getUsers(page = 1, limit = 20, search?: string): Promise<PaginatedResponse<User>> {
    const params: Record<string, unknown> = { page, limit };
    if (search) params.search = search;
    const { data } = await api.get('/admin/users', { params });
    return normalizePaginated(data);
  },

  async getUser(id: string) {
    const { data } = await api.get(`/admin/users/${id}`);
    return data.data ?? data;
  },

  async updateUser(id: string, updates: Record<string, unknown>) {
    const { data } = await api.patch(`/admin/users/${id}`, updates);
    return data.data ?? data;
  },

  async deactivateUser(id: string): Promise<void> {
    await api.delete(`/admin/users/${id}`);
  },

  // Bots
  async getBots(page = 1, limit = 20, status?: string): Promise<PaginatedResponse<Bot>> {
    const params: Record<string, unknown> = { page, limit };
    if (status) params.status = status;
    const { data } = await api.get('/admin/bots', { params });
    return normalizePaginated(data);
  },

  async approveBot(id: string) {
    const { data } = await api.patch(`/admin/bots/${id}/approve`);
    return data.data ?? data;
  },

  async rejectBot(id: string, reason?: string) {
    const { data } = await api.patch(`/admin/bots/${id}/reject`, { reason });
    return data.data ?? data;
  },

  async suspendBot(id: string) {
    const { data } = await api.patch(`/admin/bots/${id}/suspend`);
    return data.data ?? data;
  },

  async reactivateBot(id: string) {
    const { data } = await api.patch(`/admin/bots/${id}/reactivate`);
    return data.data ?? data;
  },

  async getBotDetail(id: string) {
    const { data } = await api.get(`/admin/bots/${id}/detail`);
    return data.data ?? data;
  },

  async deleteReview(id: string) {
    const { data } = await api.delete(`/admin/reviews/${id}`);
    return data;
  },

  // User Detail
  async getUserDetail(id: string) {
    const { data } = await api.get(`/admin/users/${id}/detail`);
    return data.data ?? data;
  },

  // Trades
  async getTrades(page = 1, limit = 20, userId?: string, botId?: string) {
    const params: Record<string, unknown> = { page, limit };
    if (userId) params.userId = userId;
    if (botId) params.botId = botId;
    const { data } = await api.get('/admin/trades', { params });
    return normalizePaginated(data);
  },

  // Chats
  async getChats(page = 1, limit = 20, userId?: string) {
    const params: Record<string, unknown> = { page, limit };
    if (userId) params.userId = userId;
    const { data } = await api.get('/admin/chats', { params });
    return normalizePaginated(data);
  },

  // Shadow Sessions
  async getShadowSessions(page = 1, limit = 20) {
    const { data } = await api.get('/admin/shadow-sessions', { params: { page, limit } });
    return normalizePaginated(data);
  },

  // Subscription Management (grant / revoke)
  async grantSubscription(userId: string, tier: string, durationDays: number) {
    const { data } = await api.post(`/admin/users/${userId}/subscription`, { tier, durationDays });
    return data.data ?? data;
  },

  async revokeSubscription(userId: string) {
    const { data } = await api.delete(`/admin/users/${userId}/subscription`);
    return data.data ?? data;
  },

  // Subscriptions
  async getSubscriptions(page = 1, limit = 20): Promise<PaginatedResponse<Subscription>> {
    const { data } = await api.get('/admin/subscriptions', { params: { page, limit } });
    return normalizePaginated(data);
  },

  // Exchanges
  async getExchanges(page = 1, limit = 20): Promise<PaginatedResponse<Exchange>> {
    const { data } = await api.get('/admin/exchanges', { params: { page, limit } });
    return normalizePaginated(data);
  },

  // Settings
  async getSettings(): Promise<SystemSettings> {
    const { data } = await api.get('/admin/settings');
    return data.data ?? data;
  },

  async updateSettings(updates: Partial<SystemSettings>) {
    const { data } = await api.patch('/admin/settings', updates);
    return data;
  },

  // System
  async getSystemHealth(): Promise<SystemHealth> {
    const { data } = await api.get('/admin/system/health');
    return data.data ?? data;
  },

  // Notifications
  async sendNotification(payload: SendNotificationPayload): Promise<{ sent: number }> {
    const { data } = await api.post('/admin/notifications', payload);
    return data.data ?? data;
  },
};
