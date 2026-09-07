import type { PublicUser, RegisterResult, UpdateProfileInput } from '@social-cup/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiClient, ApiError } from '@/lib/api';
import { clearStoredAuth, getStoredRefreshToken, storeRefreshToken } from '@/lib/auth-storage';

/**
 * Mobile auth state model (docs/architecture/authentication.md): the app is
 * loading, unauthenticated, or authenticated. "Authenticated" is deliberately
 * separate from "Member" — membership entitlement (ADR-0008) is a capability
 * the server computes from subscription state and is never fabricated
 * client-side; this context only tracks the session.
 */
export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<RegisterResult>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: UpdateProfileInput) => Promise<void>;
  /** Rotates the refresh token (single-flighted); used by the API client on 401. */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  // Refs hold the live tokens so the ApiClient's getAccessToken callback is
  // stable across renders; the access token exists only here, in memory.
  const tokensRef = useRef<{ access: string | null; refresh: string | null }>({
    access: null,
    refresh: null,
  });
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const apiRef = useRef<ApiClient | null>(null);

  const refreshSession = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshToken = tokensRef.current.refresh;
    if (!refreshToken) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');

    // Single-flight: parallel 401s share one rotation. Two concurrent
    // rotations of the same refresh token would look like reuse to the
    // server and revoke the whole chain (docs/architecture/authentication.md).
    const pending = (async () => {
      const tokens = await apiRef.current!.refresh(refreshToken);
      tokensRef.current = { access: tokens.accessToken, refresh: tokens.refreshToken };
      await storeRefreshToken(tokens.refreshToken);
    })().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = pending;
    return pending;
  }, []);

  // The ApiClient needs refreshSession; refreshSession needs the client — a
  // ref breaks the cycle.
  useEffect(() => {
    apiRef.current = new ApiClient({
      getAccessToken: () => tokensRef.current.access,
      refreshSession,
    });
  }, [refreshSession]);

  // Restore a persisted session on app start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedRefreshToken = await getStoredRefreshToken();
      if (!storedRefreshToken) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }
      tokensRef.current = { access: null, refresh: storedRefreshToken };
      try {
        await refreshSession();
        const me = await apiRef.current!.getMe();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        // Revoked/expired token or offline — clear and treat as signed out.
        await clearStoredAuth();
        tokensRef.current = { access: null, refresh: null };
        if (!cancelled) setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRef.current!.login(email, password);
    tokensRef.current = { access: result.tokens.accessToken, refresh: result.tokens.refreshToken };
    await storeRefreshToken(result.tokens.refreshToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokensRef.current.refresh;
    // Clear local state first so the UI responds immediately; revoking the
    // chain server-side is best-effort (network may be gone).
    tokensRef.current = { access: null, refresh: null };
    setUser(null);
    setStatus('unauthenticated');
    await clearStoredAuth();
    if (refreshToken) {
      try {
        await apiRef.current!.logout(refreshToken);
      } catch {
        // The local session is already gone; nothing more to do.
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      register: (input) => apiRef.current!.register(input),
      verifyEmail: (token) => apiRef.current!.verifyEmail(token).then(() => undefined),
      resendVerification: (email) =>
        apiRef.current!.resendVerification(email).then(() => undefined),
      forgotPassword: (email) => apiRef.current!.forgotPassword(email).then(() => undefined),
      resetPassword: (token, password) =>
        apiRef.current!.resetPassword(token, password).then(() => undefined),
      logout,
      updateProfile: async (fields) => {
        const updated = await apiRef.current!.updateMe(fields);
        setUser(updated);
      },
      refreshSession,
    }),
    [status, user, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
