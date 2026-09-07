import * as SecureStore from 'expo-secure-store';

/**
 * Where the refresh token lives on device. Per docs/architecture/authentication.md
 * the refresh token goes in OS-level secure storage (expo-secure-store), never
 * AsyncStorage — the access token lives only in memory in the auth context and
 * is never persisted at all.
 */
const REFRESH_TOKEN_KEY = 'socialcup.refreshToken';

export async function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearStoredAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
