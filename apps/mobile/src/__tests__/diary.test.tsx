import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import DiaryScreen from '../app/diary';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
const mockGetDiary = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>redirect:{href}</Text>;
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated',
    user: null,
    login: jest.fn(),
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    updateProfile: jest.fn(),
    refreshSession: jest.fn(),
    getCafes: jest.fn(),
    getFeaturedCafes: jest.fn(),
    getSignatureDrinks: jest.fn(),
    getNeighborhoods: jest.fn(),
    getCafeDetail: jest.fn(),
    getMyRating: jest.fn(),
    rateDrink: jest.fn(),
    getDiary: mockGetDiary,
    getMembership: jest.fn(),
    subscribeMembership: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createRedemption: jest.fn(),
    getRedemptionStatus: jest.fn(),
    ...overrides,
  };
}

function renderDiary(auth: AuthContextValue) {
  mockAuthValue = auth;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiaryScreen />
    </QueryClientProvider>,
  );
}

describe('DiaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to sign-in when there is no authenticated session', () => {
    renderDiary(authValue({ status: 'unauthenticated' }));
    expect(screen.getByText('redirect:/login')).toBeTruthy();
  });

  it('shows an empty state with no rated drinks', async () => {
    mockGetDiary.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    });
    renderDiary(authValue());
    await waitFor(() => expect(screen.getByTestId('diary-empty')).toBeTruthy());
  });

  it('lists diary entries with drink, cafe, stars, note, and date', async () => {
    mockGetDiary.mockResolvedValue({
      items: [
        {
          ratingId: 'r-1',
          stars: 5,
          note: 'Perfect',
          createdAt: '2026-01-15T00:00:00.000Z',
          drink: { id: 'drink-1', name: 'Oat Milk Cortado', photoUrl: null },
          cafe: {
            id: 'cafe-1',
            name: 'Blackwood Roasting Co.',
            neighborhood: 'Bishop Arts District',
          },
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    renderDiary(authValue());

    await waitFor(() => expect(screen.getByText('Oat Milk Cortado')).toBeTruthy());
    expect(screen.getByText(/Blackwood Roasting Co\./)).toBeTruthy();
    expect(screen.getByText('★★★★★')).toBeTruthy();
    expect(screen.getByText(/Perfect/)).toBeTruthy();
  });

  it('shows a retry action when the diary fails to load', async () => {
    mockGetDiary.mockRejectedValue(new Error('network down'));
    renderDiary(authValue());
    await waitFor(() => expect(screen.getByTestId('diary-error')).toBeTruthy());
  });
});
