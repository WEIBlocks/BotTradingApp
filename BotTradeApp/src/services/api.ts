import {API_BASE_URL, REQUEST_TIMEOUT} from '../config/api';
import {storage} from './storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string[]>;

  constructor(status: number, message: string, code?: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  auth?: boolean; // default true — attach Bearer token
  timeout?: number;
};

// ─── Token Refresh Lock ──────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken}),
    });

    if (!res.ok) {
      // Only clear tokens on auth rejection (401/403), not server errors
      if (res.status === 401 || res.status === 403) {
        await storage.clearTokens();
      }
      return false;
    }

    const data = await res.json();
    await storage.setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    // Network error — don't clear tokens, just fail silently
    // User can retry and tokens may still be valid
    return false;
  }
}

// ─── Core Request Function ───────────────────────────────────────────────────

export async function request<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers: customHeaders = {},
    auth = true,
    timeout = REQUEST_TIMEOUT,
  } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // Attach auth token
  if (auth) {
    const token = await storage.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // ── 401: try refresh once, then retry ──
    if (res.status === 401 && auth) {
      if (!refreshPromise) {
        refreshPromise = refreshTokens().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;
      if (refreshed) {
        // Retry the original request with new token
        const newToken = await storage.getAccessToken();
        headers.Authorization = `Bearer ${newToken}`;

        const retry = await fetch(`${API_BASE_URL}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!retry.ok) {
          const errData = await retry.json().catch(() => ({}));
          throw new ApiError(
            retry.status,
            errData.error || errData.message || 'Request failed',
            errData.code,
            errData.details,
          );
        }

        return (await retry.json()) as T;
      }

      // Refresh failed — clear tokens, throw 401
      throw new ApiError(401, 'Session expired. Please log in again.', 'SESSION_EXPIRED');
    }

    // ── Parse error responses ──
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        errData.error || errData.message || `Request failed (${res.status})`,
        errData.code,
        errData.details,
      );
    }

    // Some endpoints return 204 no-content
    if (res.status === 204) return {} as T;

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof ApiError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out. Please check your connection.', 'TIMEOUT');
    }

    // Network error (no internet, DNS failure, etc.)
    throw new ApiError(
      0,
      'Unable to connect to the server. Please check your internet connection.',
      'NETWORK_ERROR',
    );
  }
}

// ─── Convenience Methods ─────────────────────────────────────────────────────

export const api = {
  get<T>(endpoint: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(endpoint, {...opts, method: 'GET'});
  },
  post<T>(endpoint: string, body?: Record<string, unknown>, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(endpoint, {...opts, method: 'POST', body});
  },
  patch<T>(endpoint: string, body?: Record<string, unknown>, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(endpoint, {...opts, method: 'PATCH', body});
  },
  put<T>(endpoint: string, body?: Record<string, unknown>, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(endpoint, {...opts, method: 'PUT', body});
  },
  delete<T>(endpoint: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<T>(endpoint, {...opts, method: 'DELETE'});
  },
};
