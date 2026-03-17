import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = 'alert' | 'system' | 'trade';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  priority?: 'low' | 'medium' | 'high';
};

export type NotificationsResponse = {
  notifications: Notification[];
  total: number;
  page: number;
  limit: number;
};

// Backend returns { data: [...], pagination: {...} }
interface BackendPaginatedNotifs {
  data: Notification[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const notificationsService = {
  /** List notifications (paginated) */
  async list(page = 1, limit = 20): Promise<NotificationsResponse> {
    const res = await api.get<any>(`/notifications?page=${page}&limit=${limit}`);
    // Handle both { data: [...], pagination: {...} } and direct array response
    const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    return {
      notifications: items,
      total: res?.pagination?.total ?? items.length,
      page: res?.pagination?.page ?? 1,
      limit: res?.pagination?.limit ?? limit,
    };
  },

  /** Mark a single notification as read */
  markRead(notificationId: string) {
    return api.patch(`/notifications/${notificationId}/read`, {});
  },

  /** Mark all notifications as read */
  markAllRead() {
    return api.put('/notifications/read-all', {});
  },

  /** Get count of unread notifications */
  async getUnreadCount(): Promise<number> {
    try {
      const res = await this.list(1, 50);
      return res.notifications.filter(n => !n.read).length;
    } catch {
      return 0;
    }
  },
};
