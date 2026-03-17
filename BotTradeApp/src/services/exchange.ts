import {api} from './api';

// ─── Backend Response Types ─────────────────────────────────────────────────

interface ConnectionRow {
  id: string;
  provider: string;
  method: string;
  status: string;
  accountLabel: string | null;
  totalBalance: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface AvailableExchange {
  name: string;
  subtitle: string;
  methods: string[];
  color: string;
}

interface DataWrap<T> { data: T }

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface ExchangeConnection {
  id: string;
  provider: string;
  method: string;
  status: string;
  accountLabel: string;
  totalBalance: number;
  lastSync: string;
  errorMessage: string | null;
}

export interface ExchangeInfo {
  name: string;
  subtitle: string;
  methods: string[];
  color: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function mapConnection(c: ConnectionRow): ExchangeConnection {
  return {
    id: c.id ?? '',
    provider: c.provider ?? '',
    method: c.method ?? 'api_key',
    status: c.status ?? 'disconnected',
    accountLabel: c.accountLabel ?? 'Trading Account',
    totalBalance: parseFloat(c.totalBalance ?? '0') || 0,
    lastSync: timeAgo(c.lastSyncAt),
    errorMessage: c.errorMessage ?? null,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

export const exchangeApi = {
  /** Get available exchanges. */
  async getAvailable(): Promise<ExchangeInfo[]> {
    const res = await api.get<DataWrap<AvailableExchange[]>>('/exchange/available', {auth: false});
    return Array.isArray(res?.data) ? res.data : [];
  },

  /** Get user's connected exchanges. */
  async getConnections(): Promise<ExchangeConnection[]> {
    const res = await api.get<DataWrap<ConnectionRow[]>>('/exchange/user/connections');
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapConnection);
  },

  /** Test API key connection without saving. */
  async testConnection(provider: string, apiKey: string, apiSecret: string) {
    return api.post<DataWrap<{success: boolean; provider: string; message: string}>>('/exchange/test-connection', {
      provider, apiKey, apiSecret, method: 'api_key',
    });
  },

  /** Connect via API key. */
  async connectApiKey(provider: string, apiKey: string, apiSecret: string) {
    return api.post<DataWrap<ConnectionRow>>('/exchange/connect', {
      provider, apiKey, apiSecret, method: 'api_key',
    });
  },

  /** Initiate OAuth flow. */
  async initiateOAuth(provider: string) {
    return api.post<DataWrap<{authUrl: string; state: string; provider: string}>>('/exchange/oauth/initiate', {provider});
  },

  /** Resync a connection. */
  async resync(connectionId: string) {
    return api.post<DataWrap<ConnectionRow>>(`/exchange/${connectionId}/resync`);
  },

  /** Disconnect an exchange. */
  async disconnect(connectionId: string) {
    return api.post<DataWrap<ConnectionRow>>(`/exchange/${connectionId}/disconnect`);
  },
};
