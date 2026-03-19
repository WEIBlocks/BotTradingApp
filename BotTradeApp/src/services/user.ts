import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string | null;
  avatarColor: string | null;
  riskTolerance: number | null;
  investmentGoal: string | null;
  referralCode: string | null;
  onboardingComplete: boolean;
  isActive: boolean;
  createdAt: string;
  authProvider?: 'email' | 'google' | 'apple';
}

export interface WalletData {
  user: {id: string; name: string; email: string};
  totalBalance: string;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  amount: string | null;
  createdAt: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  totalEarned: number;
  activeReferrals: number;
}

export interface NotificationSettings {
  id: string;
  userId: string;
  tradeAlerts: boolean;
  systemUpdates: boolean;
  priceAlerts: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
}

// ─── User API ────────────────────────────────────────────────────────────────

export const userApi = {
  async getProfile(): Promise<UserProfile> {
    return api.get<UserProfile>('/user/profile');
  },

  async updateProfile(data: {
    name?: string;
    risk_tolerance?: number;
    investment_goal?: string;
    avatar_color?: string;
    avatar_initials?: string;
  }): Promise<UserProfile> {
    return api.patch<UserProfile>('/user/profile', data as Record<string, unknown>);
  },

  async getWallet(): Promise<WalletData> {
    return api.get<WalletData>('/user/wallet');
  },

  async getActivity(page = 1, limit = 20): Promise<ActivityResponse> {
    return api.get<ActivityResponse>(`/user/activity?page=${page}&limit=${limit}`);
  },

  async getSettings(): Promise<NotificationSettings> {
    return api.get<NotificationSettings>('/user/settings');
  },

  async updateSettings(data: {
    trade_alerts?: boolean;
    system_updates?: boolean;
    price_alerts?: boolean;
    push_enabled?: boolean;
    email_enabled?: boolean;
  }): Promise<NotificationSettings> {
    return api.patch<NotificationSettings>('/user/settings', data as Record<string, unknown>);
  },

  async getReferralInfo(): Promise<ReferralInfo> {
    const res = await api.get<{data: ReferralInfo}>('/user/referral');
    return res.data;
  },
};
