import type { PublicUser } from '@social-cup/types';
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
 * Admin session state, the same token-rotation pattern as
 * apps/mobile/src/contexts/auth-context.tsx (refresh token persisted,
 * access token in memory only). `isAdmin` is a UI convenience derived from
 * the returned `PublicUser.role` — every admin API route re-checks the role
 * from the database on every request (`requireAdmin`), so this can never be
 * the actual authorization boundary, only what decides whether to show the
 * admin UI at all versus an "access denied" screen.
 */
export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  isAdmin: boolean;
  api: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

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

    const pending = (async () => {
      const tokens = await apiRef.current!.refresh(refreshToken);
      tokensRef.current = { access: tokens.accessToken, refresh: tokens.refreshToken };
      storeRefreshToken(tokens.refreshToken);
    })().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    apiRef.current = new ApiClient({
      getAccessToken: () => tokensRef.current.access,
      refreshSession,
    });
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedRefreshToken = getStoredRefreshToken();
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
        clearStoredAuth();
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
    storeRefreshToken(result.tokens.refreshToken);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokensRef.current.refresh;
    tokensRef.current = { access: null, refresh: null };
    setUser(null);
    setStatus('unauthenticated');
    clearStoredAuth();
    if (refreshToken) {
      try {
        await apiRef.current!.logout(refreshToken);
      } catch {
        // Local session is already cleared; nothing more to do.
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === 'admin',
      api:
        apiRef.current ??
        new ApiClient({ getAccessToken: () => tokensRef.current.access, refreshSession }),
      login,
      logout,
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
