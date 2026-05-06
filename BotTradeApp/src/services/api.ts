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

// ─── Global sign-out hook ────────────────────────────────────────────────────
//
// AuthContext registers itself here on mount. When the request layer detects
// the session is irrecoverably dead (refresh-token rejected by the server),
// it calls this to clear tokens AND flip the auth state so the navigator
// shows the login screen — instead of leaving stale tokens in storage and
// throwing a 401 the screen silently swallows.
//
// Transient failures (network timeout, 5xx, no internet during refresh) do
// NOT call this — those just fail the request and keep tokens intact for the
// next attempt.

let onSessionInvalid: (() => void) | null = null;

export function registerSessionInvalidHandler(fn: (() => void) | null) {
  onSessionInvalid = fn;
}

let signOutInFlight = false;

async function triggerSessionInvalid() {
  if (signOutInFlight) return;
  signOutInFlight = true;
  try {
    await storage.clearTokens();
  } catch {}
  try {
    onSessionInvalid?.();
  } catch {}
  // Allow another sign-out trigger after a tick — for cases where the user
  // logs back in and we want a clean slate again on next failure.
  setTimeout(() => { signOutInFlight = false; }, 1000);
}

// ─── JWT decode (payload only — we never trust the signature client-side) ────

function decodeExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // RN doesn't always have atob — use Buffer-free decoder.
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const g: any = globalThis as any;
    const decoded = typeof g.atob === 'function' ? g.atob(padded) : decodeBase64(padded);
    const json = JSON.parse(decoded);
    if (typeof json.exp === 'number') return json.exp * 1000; // → ms
    return null;
  } catch {
    return null;
  }
}

function decodeBase64(s: string): string {
  // Minimal base64 decoder for environments without atob. RN/Hermes has atob,
  // but we keep this fallback so a missing global doesn't break auth.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < s.length; i += 4) {
    const b1 = chars.indexOf(s[i]);
    const b2 = chars.indexOf(s[i + 1]);
    const b3 = chars.indexOf(s[i + 2]);
    const b4 = chars.indexOf(s[i + 3]);
    const c1 = (b1 << 2) | (b2 >> 4);
    const c2 = ((b2 & 15) << 4) | (b3 >> 2);
    const c3 = ((b3 & 3) << 6) | b4;
    out += String.fromCharCode(c1);
    if (s[i + 2] !== '=') out += String.fromCharCode(c2);
    if (s[i + 3] !== '=') out += String.fromCharCode(c3);
  }
  return out;
}

// ─── Token refresh (deduplicated, transient-aware) ───────────────────────────

type RefreshOutcome =
  | { ok: true }                      // refresh succeeded, new tokens stored
  | { ok: false; fatal: true }        // refresh rejected — session is dead
  | { ok: false; fatal: false };      // transient (network, 5xx, timeout)

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function refreshTokens(): Promise<RefreshOutcome> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return { ok: false, fatal: true };

  // Bound the refresh request itself — never let a slow refresh hang the UI.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data?.accessToken && data?.refreshToken) {
        await storage.setTokens(data.accessToken, data.refreshToken);
        return { ok: true };
      }
      // Malformed success response — treat as transient, don't kill the session.
      return { ok: false, fatal: false };
    }

    // Server said no. Only 401/403 (refresh-token revoked / expired / invalid)
    // are session-fatal. 4xx other than that or 5xx are transient and we keep
    // tokens so the user can retry once the server is healthy again.
    if (res.status === 401 || res.status === 403) {
      return { ok: false, fatal: true };
    }
    return { ok: false, fatal: false };
  } catch (err) {
    clearTimeout(timer);
    // Aborted, network gone, DNS — all transient. Don't logout.
    return { ok: false, fatal: false };
  }
}

/**
 * Refresh the access token if it's missing or close to expiring. Used as a
 * proactive check before fetches so we don't waste a round-trip discovering
 * an expired token, and so screens that fire bursts of requests don't all
 * race against the same expired access token.
 *
 * Returns true if the access token is currently valid (or was refreshed).
 * Returns false if there is no session to refresh; callers should NOT treat
 * this as fatal — it just means "no auth header attachable".
 */
async function ensureFreshAccessToken(): Promise<boolean> {
  const token = await storage.getAccessToken();
  if (!token) return false;

  const expMs = decodeExpiry(token);
  if (expMs == null) return true; // unknown shape — let the server decide

  // Refresh proactively if the token expires within the next 60 seconds.
  // 60s is well under any sane access TTL (we ship 30m) and gives plenty
  // of slack against clock drift.
  const REFRESH_THRESHOLD_MS = 60_000;
  if (expMs - Date.now() > REFRESH_THRESHOLD_MS) return true;

  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
  }
  const outcome = await refreshPromise;
  if (outcome.ok) return true;
  if (outcome.fatal) {
    await triggerSessionInvalid();
    return false;
  }
  // Transient — fall through to the actual request with the (likely soon-to-
  // be-expired) access token. The 401 path will retry once and surface a
  // proper error if it really has gone sour.
  return true;
}

// ─── Core request ────────────────────────────────────────────────────────────

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

  if (auth) {
    await ensureFreshAccessToken();
  }

  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...customHeaders,
  };

  if (auth) {
    const token = await storage.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = async (authHeader?: string) => {
    const finalHeaders = authHeader
      ? { ...headers, Authorization: authHeader }
      : headers;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let res = await doFetch();

    // ── 401 with auth: refresh once, retry once ──
    if (res.status === 401 && auth) {
      if (!refreshPromise) {
        refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
      }
      const outcome = await refreshPromise;
      if (outcome.ok) {
        const newToken = await storage.getAccessToken();
        res = await doFetch(newToken ? `Bearer ${newToken}` : undefined);
      } else if (outcome.fatal) {
        await triggerSessionInvalid();
        throw new ApiError(401, 'Session expired. Please log in again.', 'SESSION_EXPIRED');
      } else {
        // Transient refresh failure — surface a network error so the caller
        // can retry; do NOT clear tokens.
        throw new ApiError(0, 'Could not refresh session. Check your connection and try again.', 'REFRESH_FAILED');
      }
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        errData.error || errData.message || `Request failed (${res.status})`,
        errData.code,
        errData.details,
      );
    }
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out. Please check your connection.', 'TIMEOUT');
    }
    throw new ApiError(0, 'Unable to connect to the server. Please check your internet connection.', 'NETWORK_ERROR');
  }
}

// ─── Multipart upload — same auth/refresh semantics as request() ─────────────

export async function uploadFormData<T = unknown>(
  endpoint: string,
  formData: FormData,
): Promise<T> {
  await ensureFreshAccessToken();

  const headers: Record<string, string> = {};
  let token = await storage.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Do NOT set Content-Type — fetch will set the correct multipart boundary.

  const doUpload = async (authHeader?: string) => {
    const finalHeaders = authHeader ? { ...headers, Authorization: authHeader } : headers;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min
    try {
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: finalHeaders,
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let res = await doUpload();

    if (res.status === 401) {
      if (!refreshPromise) {
        refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
      }
      const outcome = await refreshPromise;
      if (outcome.ok) {
        token = await storage.getAccessToken();
        res = await doUpload(token ? `Bearer ${token}` : undefined);
      } else if (outcome.fatal) {
        await triggerSessionInvalid();
        throw new ApiError(401, 'Session expired. Please log in again.', 'SESSION_EXPIRED');
      } else {
        throw new ApiError(0, 'Could not refresh session. Check your connection and try again.', 'REFRESH_FAILED');
      }
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        errData.error || errData.message || `Upload failed (${res.status})`,
        errData.code,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, 'Upload timed out.', 'TIMEOUT');
    }
    throw new ApiError(0, 'Upload failed. Check your connection.', 'NETWORK_ERROR');
  }
}

// ─── Authenticated raw fetch — for callers that need direct fetch (e.g. push
// token registration, FCM-token refresh) but still want token attachment +
// 401 → refresh + retry. Unlike `request()`, this returns the Response so
// callers can read non-JSON bodies. ────────────────────────────────────────

export async function authedFetch(
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  await ensureFreshAccessToken();
  let token = await storage.getAccessToken();
  const buildHeaders = (t: string | null) => {
    const h: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  let res = await fetch(`${API_BASE_URL}${endpoint}`, { ...init, headers: buildHeaders(token) });

  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
    }
    const outcome = await refreshPromise;
    if (outcome.ok) {
      token = await storage.getAccessToken();
      res = await fetch(`${API_BASE_URL}${endpoint}`, { ...init, headers: buildHeaders(token) });
    } else if (outcome.fatal) {
      await triggerSessionInvalid();
    }
    // On transient failure, return the original 401 response to the caller —
    // we don't pretend it succeeded but we don't sign the user out either.
  }

  return res;
}

// ─── Convenience methods ─────────────────────────────────────────────────────

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
