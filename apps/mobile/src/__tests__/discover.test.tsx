import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
const mockPush = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => false }),
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'denied' }),
  requestForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false, status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
}));

const CAFE = {
  id: 'cafe-1',
  name: 'Blackwood Roasting Co.',
  neighborhood: 'Bishop Arts District',
  coverPhotoUrl: null,
  vibeTags: ['Good for remote work'],
  lowestCreditPrice: 4,
  featured: false,
  distanceMiles: null,
  averageRating: null,
  ratingCount: 0,
  isNew: true as const,
};

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
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
      .mockResolvedValue({ items: [CAFE], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }),
    getFeaturedCafes: jest.fn().mockResolvedValue([]),
    getSignatureDrinks: jest.fn().mockResolvedValue([]),
    getNeighborhoods: jest.fn().mockResolvedValue(['Bishop Arts District', 'Uptown']),
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

function renderDiscover(auth: AuthContextValue) {
  mockAuthValue = auth;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('Discover screen', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows a loading skeleton before the cafe list resolves', async () => {
    const auth = authValue({ getCafes: jest.fn(() => new Promise(() => {})) });
    renderDiscover(auth);
    expect(screen.getByLabelText('Loading cafes')).toBeTruthy();
    // Flush the async location-permission resolution so its state update
    // happens inside act, matching the pattern in index.test.tsx.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('renders cafe cards once the list loads', async () => {
    renderDiscover(authValue());
    await waitFor(() => expect(screen.getByTestId('cafe-card')).toBeTruthy());
    const card = within(screen.getByTestId('cafe-card'));
    expect(card.getByText('Blackwood Roasting Co.')).toBeTruthy();
    expect(card.getByText('Bishop Arts District')).toBeTruthy();
    expect(card.getByText(/Drinks from 4 credits/)).toBeTruthy();
  });

  it('shows an empty state with no cafes and no active filters', async () => {
    const auth = authValue({
      getCafes: jest
        .fn()
        .mockResolvedValue({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 1 }),
    });
    renderDiscover(auth);
    await waitFor(() => expect(screen.getByText('No cafés yet')).toBeTruthy());
  });

  it('shows a retry action when the list fails to load', async () => {
    const auth = authValue({ getCafes: jest.fn().mockRejectedValue(new Error('network down')) });
    renderDiscover(auth);
    await waitFor(() => expect(screen.getByText("Couldn't load cafés")).toBeTruthy());
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('re-queries by name as the user types (debounced)', async () => {
    const auth = authValue();
    renderDiscover(auth);
    await waitFor(() => expect(screen.getByText('Blackwood Roasting Co.')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('discover-search'), 'blackwood');

    await waitFor(
      () => {
        const calls = (auth.getCafes as jest.Mock).mock.calls;
        expect(calls.some(([params]) => params.search === 'blackwood')).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it('re-queries by neighbourhood when a filter chip is selected', async () => {
    const auth = authValue();
    renderDiscover(auth);
    await waitFor(() => expect(screen.getByText('Uptown')).toBeTruthy());

    fireEvent.press(screen.getByText('Uptown'));

    await waitFor(() => {
      const calls = (auth.getCafes as jest.Mock).mock.calls;
      expect(calls.some(([params]) => params.neighborhood === 'Uptown')).toBe(true);
    });
  });

  it('navigates to the cafe detail screen when a card is pressed', async () => {
    renderDiscover(authValue());
    await waitFor(() => expect(screen.getByTestId('cafe-card')).toBeTruthy());

    fireEvent.press(screen.getByTestId('cafe-card'));
    expect(mockPush).toHaveBeenCalledWith('/cafe/cafe-1');
  });
});
