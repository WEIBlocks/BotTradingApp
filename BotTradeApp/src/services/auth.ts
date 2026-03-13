import {api, ApiError} from './api';
import {storage} from './storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  isNewUser?: boolean;
  onboardingComplete?: boolean;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/register', {name, email, password}, {auth: false});
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/login', {email, password}, {auth: false});
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    return data;
  },

  async googleSignIn(idToken: string): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/google', {idToken}, {auth: false});
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    return data;
  },

  async appleSignIn(
    identityToken: string,
    fullName?: {firstName?: string; lastName?: string},
  ): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/apple', {identityToken, fullName}, {auth: false});
    await storage.setTokens(data.accessToken, data.refreshToken);
    await storage.setUser(data.user);
    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = await storage.getRefreshToken();
    try {
      await api.post('/auth/logout', {refreshToken});
    } catch {
      // Even if logout API fails, clear local tokens
    }
    await storage.clearTokens();
  },

  async saveQuizResults(data: {
    riskTolerance: number;
    investmentGoal?: string;
    timeHorizon?: string;
  }): Promise<void> {
    await api.post('/user/quiz', data);
  },

  /** Check if we have a valid session from stored tokens */
  async restoreSession(): Promise<{user: AuthUser; onboardingComplete: boolean} | null> {
    const token = await storage.getAccessToken();
    if (!token) return null;

    try {
      const data = await api.get<{
        id: string;
        name: string;
        email: string;
        role: string;
        onboardingComplete: boolean;
      }>('/user/profile');
      const user: AuthUser = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
      };
      await storage.setUser(user);
      return { user, onboardingComplete: data.onboardingComplete ?? false };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await storage.clearTokens();
      }
      return null;
    }
  },
};
