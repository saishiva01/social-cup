import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  requestForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true, status: 'granted' }),
  getCurrentPositionAsync: jest
    .fn()
    .mockResolvedValue({ coords: { latitude: 32.78, longitude: -96.8 } }),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
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
      role: 'user',
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
    getCafes: jest
      .fn()
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 1 }),
    getFeaturedCafes: jest.fn().mockResolvedValue([]),
    getSignatureDrinks: jest.fn().mockResolvedValue([]),
    getNeighborhoods: jest.fn().mockResolvedValue([]),
    getCafeDetail: jest.fn(),
    getMyRating: jest.fn(),
    rateDrink: jest.fn(),
    getDiary: jest.fn(),
    getMembership: jest.fn(),
    subscribeMembership: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createRedemption: jest.fn(),
    getRedemptionStatus: jest.fn(),
    ...overrides,
  };
}

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('HomeScreen', () => {
  it('routes an authenticated user into cafe discovery', async () => {
    mockAuthValue = authValue({});
    renderHome();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.getByText(/Hi Ada/)).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('shows the welcome screen with sign-up/sign-in choices when unauthenticated', async () => {
    mockAuthValue = authValue({ status: 'unauthenticated', user: null });
    renderHome();
    await act(async () => {
      await Promise.resolve();
    });
    // The authenticated home content must not render.
    expect(screen.queryByText('Discover')).toBeNull();
    expect(screen.getByText('Get started')).toBeTruthy();
    expect(screen.getByText('I already have an account')).toBeTruthy();
  });
});
