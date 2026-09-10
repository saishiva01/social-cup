/**
 * Persists only the refresh token, the same choice apps/mobile makes (see
 * its src/lib/auth-storage.ts) — the access token lives only in memory and
 * is re-derived via a rotation on load. `localStorage` is this app's
 * equivalent of Expo SecureStore: same-origin only, never sent to another
 * site, cleared on logout.
 */
const REFRESH_TOKEN_KEY = 'social-cup-admin.refreshToken';

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeRefreshToken(token: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    // Private browsing / storage disabled — session just won't persist across reloads.
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to do — there was never anything reliably stored.
  }
}
