import { act, render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

// Redirect needs a navigation container; in isolation it just must not
// render the authenticated home content.
jest.mock('expo-router', () => ({
  Redirect: () => null,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  requestForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true, status: 'granted' }),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'u-1',
      email: 'ada@example.com',
      displayName: 'Ada',
      profilePhotoUrl: null,
      coffeePreferences: [],
      neighborhood: null,
      emailVerified: true,
    },
    login: jest.fn(),
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    updateProfile: jest.fn(),
    refreshSession: jest.fn(),
    ...overrides,
  };
}

describe('HomeScreen', () => {
  it('greets the authenticated user and shows the profile link', async () => {
    mockAuthValue = authValue({});
    render(<HomeScreen />);
    // Flush the async location-permission resolution so its state update
    // happens inside act.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Social Cup')).toBeTruthy();
    expect(screen.getByText(/Hi Ada/)).toBeTruthy();
    expect(screen.getByText('View profile')).toBeTruthy();
  });

  it('redirects to sign-in when unauthenticated', async () => {
    mockAuthValue = authValue({ status: 'unauthenticated', user: null });
    render(<HomeScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    // The authenticated home content must not render — the Redirect takes over.
    expect(screen.queryByText('Social Cup')).toBeNull();
  });
});
