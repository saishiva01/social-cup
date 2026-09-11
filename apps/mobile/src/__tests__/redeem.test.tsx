import type {
  CreateRedemptionResult,
  MembershipStatusResult,
  RedemptionStatusResult,
} from '@social-cup/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import RedeemScreen from '../app/redeem/[drinkId]';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
let mockParams: {
  drinkId: string;
  drinkName?: string;
  cafeId: string;
  cafeName?: string;
  creditPrice?: string;
};
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockGetMembership = jest.fn();
const mockCreateRedemption = jest.fn();
const mockGetRedemptionStatus = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

const MEMBERSHIP: MembershipStatusResult = {
  isMember: true,
  status: 'active',
  credits: 12,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

const CREATED: CreateRedemptionResult = {
  id: 'redemption-1',
  cafeId: 'cafe-1',
  cafeName: 'Blackwood Roasting Co.',
  drinkId: 'drink-1',
  drinkName: 'Oat Milk Cortado',
  code: 'ABCD-EFGH-JKMN',
  backupCode: '042817',
  creditCost: 5,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
};

function pendingStatus(): RedemptionStatusResult {
  return {
    id: CREATED.id,
    status: 'pending',
    cafeName: CREATED.cafeName,
    drinkName: CREATED.drinkName,
    creditCost: CREATED.creditCost,
    expiresAt: CREATED.expiresAt,
    redeemedAt: null,
  };
}

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
    getMyRating: jest.fn(),
    rateDrink: jest.fn(),
    getDiary: jest.fn(),
    getMembership: mockGetMembership,
    subscribeMembership: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createRedemption: mockCreateRedemption,
    getRedemptionStatus: mockGetRedemptionStatus,
  };
}

function renderScreen() {
  mockAuthValue = authValue();
  // refetchInterval polling is disabled by retry:false + a single resolved
  // status per test below; no fake timers needed for these assertions.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RedeemScreen />
    </QueryClientProvider>,
  );
}

describe('RedeemScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {
      drinkId: 'drink-1',
      drinkName: 'Oat Milk Cortado',
      cafeId: 'cafe-1',
      cafeName: 'Blackwood Roasting Co.',
      creditPrice: '5',
    };
    mockGetMembership.mockResolvedValue(MEMBERSHIP);
  });

  it('shows the drink, cafe, and credit cost before generating a code — and never deducts locally', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Oat Milk Cortado')).toBeTruthy());

    expect(screen.getByText('Blackwood Roasting Co.')).toBeTruthy();
    expect(screen.getByText(/5 credits/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/12 available now/)).toBeTruthy());
    expect(mockCreateRedemption).not.toHaveBeenCalled();
  });

  it('generates a code and shows both the primary and backup codes with a countdown', async () => {
    mockCreateRedemption.mockResolvedValue(CREATED);
    mockGetRedemptionStatus.mockResolvedValue(pendingStatus());
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('redeem-generate')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-generate'));

    await waitFor(() => expect(mockCreateRedemption).toHaveBeenCalledWith('cafe-1', 'drink-1'));
    await waitFor(() => expect(screen.getByTestId('redeem-code')).toBeTruthy());
    expect(screen.getByTestId('redeem-code').props.children).toBe('ABCD-EFGH-JKMN');
    expect(screen.getByTestId('redeem-backup-code').props.children).toBe('042817');
    expect(screen.getByTestId('redeem-countdown')).toBeTruthy();
  });

  it('shows a server-reported error without creating a code', async () => {
    mockCreateRedemption.mockRejectedValue(new Error('Not enough credits for this drink'));
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('redeem-generate')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-generate'));

    await waitFor(() => expect(screen.getByTestId('redeem-error')).toBeTruthy());
    expect(screen.queryByTestId('redeem-code')).toBeNull();
  });

  it('shows the success state once the server reports the code as redeemed, and offers rate/back actions', async () => {
    mockCreateRedemption.mockResolvedValue(CREATED);
    mockGetRedemptionStatus.mockResolvedValue({
      ...pendingStatus(),
      status: 'redeemed',
      redeemedAt: new Date().toISOString(),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('redeem-generate')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-generate'));

    await waitFor(() => expect(screen.getByText('Redeemed successfully')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-rate-drink'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/rate/[drinkId]',
      params: {
        drinkId: 'drink-1',
        drinkName: 'Oat Milk Cortado',
        cafeName: 'Blackwood Roasting Co.',
      },
    });
  });

  it('shows an expired state with no credits deducted, and allows generating a new code', async () => {
    mockCreateRedemption.mockResolvedValue(CREATED);
    mockGetRedemptionStatus.mockResolvedValue({ ...pendingStatus(), status: 'expired' });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('redeem-generate')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-generate'));

    await waitFor(() => expect(screen.getByText('Code expired')).toBeTruthy());
    expect(screen.getByTestId('redeem-retry')).toBeTruthy();
  });
});
