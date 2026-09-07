import * as SecureStore from 'expo-secure-store';

import { clearStoredAuth, getStoredRefreshToken, storeRefreshToken } from '../lib/auth-storage';

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureStore.delete(key);
    return Promise.resolve();
  }),
}));

describe('auth-storage', () => {
  beforeEach(() => {
    mockSecureStore.clear();
    jest.clearAllMocks();
  });

  it('stores and returns the refresh token', async () => {
    await storeRefreshToken('refresh-token-123');
    await expect(getStoredRefreshToken()).resolves.toBe('refresh-token-123');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'socialcup.refreshToken',
      'refresh-token-123',
    );
  });

  it('returns null when nothing is stored', async () => {
    await expect(getStoredRefreshToken()).resolves.toBeNull();
  });

  it('clears the stored refresh token on logout', async () => {
    await storeRefreshToken('refresh-token-123');
    await clearStoredAuth();
    await expect(getStoredRefreshToken()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('socialcup.refreshToken');
  });
});
