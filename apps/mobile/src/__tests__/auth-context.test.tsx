import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from '../contexts/auth-context';

// All variables referenced inside jest.mock factories must be prefixed with
// `mock` (Babel's out-of-scope guard), and no class parameter properties
// (they generate hidden field declarations the guard flags).
const mockApiMethods = {
  login: jest.fn(),
  register: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  refresh: jest.fn(),
  getMe: jest.fn(),
  logout: jest.fn(),
  updateMe: jest.fn(),
};

jest.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  ApiClient: jest.fn().mockImplementation(() => mockApiMethods),
}));

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

const USER = {
  id: 'u-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  profilePhotoUrl: null,
  coffeePreferences: [],
  neighborhood: null,
  emailVerified: true,
  role: 'user' as const,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockSecureStore.clear();
    for (const method of Object.values(mockApiMethods)) {
      (method as jest.Mock).mockReset();
    }
  });

  it('starts unauthenticated when no refresh token is stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(mockApiMethods.refresh).not.toHaveBeenCalled();
  });

  it('restores an authenticated session from the stored refresh token', async () => {
    mockSecureStore.set('socialcup.refreshToken', 'refresh-1');
    mockApiMethods.refresh.mockResolvedValueOnce({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    mockApiMethods.getMe.mockResolvedValueOnce(USER);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual(USER);
    expect(mockApiMethods.refresh).toHaveBeenCalledWith('refresh-1');
    expect(mockApiMethods.getMe).toHaveBeenCalled();
  });

  it('falls back to unauthenticated when the stored refresh token is rejected', async () => {
    mockSecureStore.set('socialcup.refreshToken', 'refresh-1');
    mockApiMethods.refresh.mockRejectedValueOnce(new Error('Invalid refresh token'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
  });

  it('logs in, persists the refresh token, and sets the user', async () => {
    mockApiMethods.login.mockResolvedValueOnce({
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      user: USER,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));

    await act(async () => {
      await result.current.login('ada@example.com', 'correct-horse');
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.user).toEqual(USER);
    expect(mockSecureStore.get('socialcup.refreshToken')).toBe('refresh-1');
  });

  it('logs out, clears storage, and revokes the refresh token server-side', async () => {
    mockApiMethods.login.mockResolvedValueOnce({
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      user: USER,
    });
    mockApiMethods.logout.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    await act(async () => {
      await result.current.login('ada@example.com', 'correct-horse');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(mockApiMethods.logout).toHaveBeenCalledWith('refresh-1');
    expect(mockSecureStore.has('socialcup.refreshToken')).toBe(false);
  });

  it('single-flights concurrent refreshes', async () => {
    mockSecureStore.set('socialcup.refreshToken', 'refresh-1');
    mockApiMethods.refresh.mockImplementation(async () => ({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    }));
    mockApiMethods.getMe.mockResolvedValueOnce(USER);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // Restore consumed the first rotation; two parallel 401 retries must
    // share one in-flight rotation, not rotate the token twice.
    mockApiMethods.refresh.mockClear();
    await act(async () => {
      await Promise.all([result.current.refreshSession(), result.current.refreshSession()]);
    });
    expect(mockApiMethods.refresh).toHaveBeenCalledTimes(1);
  });
});
