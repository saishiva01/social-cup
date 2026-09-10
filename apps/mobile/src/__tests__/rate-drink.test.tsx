import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import RateDrinkScreen from '../app/rate/[drinkId]';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
let mockParams: { drinkId: string; drinkName?: string; cafeName?: string };
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetMyRating = jest.fn();
const mockRateDrink = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true }),
}));

function authValue(): AuthContextValue {
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
    getMyRating: mockGetMyRating,
    rateDrink: mockRateDrink,
    getDiary: jest.fn(),
    getMembership: jest.fn(),
    subscribeMembership: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createRedemption: jest.fn(),
    getRedemptionStatus: jest.fn(),
  };
}

function renderScreen() {
  mockAuthValue = authValue();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RateDrinkScreen />
    </QueryClientProvider>,
  );
}

describe('RateDrinkScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {
      drinkId: 'drink-1',
      drinkName: 'Oat Milk Cortado',
      cafeName: 'Blackwood Roasting Co.',
    };
    mockGetMyRating.mockResolvedValue(null);
  });

  it('shows the drink/cafe context and disables submit until a star is picked', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Oat Milk Cortado')).toBeTruthy());
    expect(screen.getByText('Blackwood Roasting Co.')).toBeTruthy();
    expect(screen.getByTestId('rate-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('submits the chosen stars and optional note, then shows a saved confirmation', async () => {
    mockRateDrink.mockResolvedValue({
      id: 'r-1',
      drinkId: 'drink-1',
      stars: 5,
      note: 'Great',
      createdAt: '',
      updatedAt: '',
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('star-5')).toBeTruthy());

    fireEvent.press(screen.getByTestId('star-5'));
    fireEvent.changeText(screen.getByTestId('rate-note'), 'Great');
    fireEvent.press(screen.getByTestId('rate-submit'));

    await waitFor(() =>
      expect(mockRateDrink).toHaveBeenCalledWith('drink-1', { stars: 5, note: 'Great' }),
    );
    expect(screen.getByText('Rating saved')).toBeTruthy();
  });

  it('prefills an existing rating for editing', async () => {
    mockGetMyRating.mockResolvedValue({
      id: 'r-1',
      drinkId: 'drink-1',
      stars: 3,
      note: 'Decent',
      createdAt: '',
      updatedAt: '',
    });
    renderScreen();

    await waitFor(() => expect(screen.getByText('Edit your rating')).toBeTruthy());
    expect(screen.getByTestId('rate-note').props.value).toBe('Decent');
  });

  it('shows an error message when the submission fails', async () => {
    mockRateDrink.mockRejectedValue(new Error('Could not save your rating.'));
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('star-4')).toBeTruthy());

    fireEvent.press(screen.getByTestId('star-4'));
    fireEvent.press(screen.getByTestId('rate-submit'));

    await waitFor(() => expect(screen.getByTestId('rate-error')).toBeTruthy());
  });
});
