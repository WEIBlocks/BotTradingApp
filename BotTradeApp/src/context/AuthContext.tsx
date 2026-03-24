import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {authApi, AuthUser} from '../services/auth';
import {api, ApiError} from '../services/api';
import {storage} from '../services/storage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;     // true while restoring session on app start
  isAuthReady: boolean;   // false until initial session check completes
  isOnboarding: boolean;  // true during registration flow (quiz + connect capital)
  isNewUser: boolean;     // true after first registration, false on login/restore
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleSignIn: (idToken: string) => Promise<void>;
  appleSignIn: (identityToken: string, fullName?: {firstName?: string; lastName?: string}) => Promise<void>;
  logout: () => Promise<void>;
  saveQuizResults: (data: {riskTolerance: number; investmentGoal?: string; timeHorizon?: string}) => Promise<void>;
  completeOnboarding: () => void;
  /** Refresh local user data (e.g. after role change) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthReady: false,
    isOnboarding: false,
    isNewUser: false,
  });

  // Restore session on mount
  useEffect(() => {
    let mounted = true;
    authApi.restoreSession().then(result => {
      if (mounted) {
        if (result) {
          // If user hasn't completed onboarding, send them back through the quiz
          const needsOnboarding = !result.onboardingComplete;
          setState({
            user: result.user,
            isLoading: false,
            isAuthReady: true,
            isOnboarding: needsOnboarding,
            isNewUser: false,
          });
        } else {
          setState({user: null, isLoading: false, isAuthReady: true, isOnboarding: false, isNewUser: false});
        }
      }
    });
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    const needsOnboarding = !result.onboardingComplete;
    setState(prev => ({
      ...prev,
      user: result.user,
      isOnboarding: needsOnboarding,
      isNewUser: false,
    }));
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.register(name, email, password);
    // Keep isOnboarding true so user stays in auth flow for quiz + connect capital
    setState(prev => ({...prev, user: result.user, isOnboarding: true, isNewUser: true}));
  }, []);

  const googleSignIn = useCallback(async (idToken: string) => {
    const result = await authApi.googleSignIn(idToken);
    // If new user or onboarding not complete, show quiz flow
    const needsOnboarding = result.isNewUser || !result.onboardingComplete;
    setState(prev => ({
      ...prev,
      user: result.user,
      isOnboarding: needsOnboarding,
      isNewUser: result.isNewUser ?? false,
    }));
  }, []);

  const appleSignIn = useCallback(async (
    identityToken: string,
    fullName?: {firstName?: string; lastName?: string},
  ) => {
    const result = await authApi.appleSignIn(identityToken, fullName);
    // If new user or onboarding not complete, show quiz flow
    const needsOnboarding = result.isNewUser || !result.onboardingComplete;
    setState(prev => ({
      ...prev,
      user: result.user,
      isOnboarding: needsOnboarding,
      isNewUser: result.isNewUser ?? false,
    }));
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    // Clear cached Google session so account picker shows next time
    try { await GoogleSignin.signOut(); } catch {}
    setState(prev => ({...prev, user: null, isOnboarding: false, isNewUser: false}));
  }, []);

  const saveQuizResults = useCallback(async (data: {
    riskTolerance: number;
    investmentGoal?: string;
    timeHorizon?: string;
  }) => {
    await authApi.saveQuizResults(data);
  }, []);

  const completeOnboarding = useCallback(() => {
    setState(prev => ({...prev, isOnboarding: false}));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api.get<{id: string; name: string; email: string; role: string}>('/user/profile');
      const updated = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
      };
      await storage.setUser(updated);
      setState(prev => ({...prev, user: updated}));
    } catch {}
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login,
    register,
    googleSignIn,
    appleSignIn,
    logout,
    saveQuizResults,
    completeOnboarding,
    refreshUser,
  }), [state, login, register, googleSignIn, appleSignIn, logout, saveQuizResults, completeOnboarding, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
