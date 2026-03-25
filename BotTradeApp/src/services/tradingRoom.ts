import {api} from './api';

export interface TradingRoomMessage {
  id: string;
  userId: string;
  content: string;
  isSystemMessage: boolean;
  createdAt: string;
  userName: string;
  avatarInitials: string | null;
  avatarColor: string | null;
  userRole?: string;
}

export interface TradingRoomMember {
  id: string;
  name: string;
  avatarInitials: string | null;
  avatarColor: string | null;
  role: string;
  isOnline: boolean;
}

export interface OnlineStats {
  online: number;
  totalMembers: number;
}

export const tradingRoomApi = {
  async getMessages(limit = 50, before?: string): Promise<{data: TradingRoomMessage[]}> {
    const params: Record<string, string | number> = {limit};
    if (before) params.before = before;
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get<{data: TradingRoomMessage[]}>(`/trading-room/messages?${qs}`);
  },

  async postMessage(content: string): Promise<{data: TradingRoomMessage}> {
    return api.post<{data: TradingRoomMessage}>('/trading-room/messages', {content});
  },

  async deleteMessage(id: string): Promise<void> {
    await api.delete(`/trading-room/messages/${id}`);
  },

  async getOnlineStats(): Promise<{data: OnlineStats}> {
    return api.get<{data: OnlineStats}>('/trading-room/online');
  },

  async getMembers(): Promise<{data: TradingRoomMember[]}> {
    return api.get<{data: TradingRoomMember[]}>('/trading-room/members');
  },
};
