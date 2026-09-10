import type { CafeDetail, MembershipStatusResult } from '@social-cup/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CafeDetailScreen from '../app/cafe/[id]';
import type { AuthContextValue } from '../contexts/auth-context';
import { ApiError } from '../lib/api';

const VISITOR_MEMBERSHIP: MembershipStatusResult = {
  isMember: false,
  status: 'incomplete',
  credits: 0,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

let mockAuthValue: AuthContextValue;
let mockCafeDetail: CafeDetail;
let mockRejectDetail: Error | null = null;
let mockMembership: MembershipStatusResult;
const mockPush = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'cafe-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const CAFE_DETAIL = {
  cafe: {
    id: 'cafe-1',
    name: 'Blackwood Roasting Co.',
    perkLine: 'Small-batch roaster with a walk-up window.',
    neighborhood: 'Bishop Arts District',
    address: '408 N Bishop Ave, Dallas, TX',
    latitude: 32.7477,
    longitude: -96.8288,
    photos: [],
    vibeTags: ['Good for remote work'],
    hours: { mon: { open: '07:00', close: '18:00' } },
    featured: true,
    isOpenNow: true,
  },
  drinks: [
    {
      id: 'drink-1',
      cafeId: 'cafe-1',
      name: 'Oat Milk Cortado',
      description: 'Equal parts espresso and steamed oat milk.',
      category: 'espresso',
      photoUrl: null,
      retailPriceCents: 500,
      creditPrice: 5,
      signature: true,
      averageRating: 4.5,
      ratingCount: 2,
    },
  ],
};

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
    getCafeDetail: jest.fn(() =>
      mockRejectDetail ? Promise.reject(mockRejectDetail) : Promise.resolve(mockCafeDetail),
    ),
    getMyRating: jest.fn(),
    rateDrink: jest.fn(),
    getDiary: jest.fn(),
    getMembership: jest.fn(() => Promise.resolve(mockMembership)),
    subscribeMembership: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createRedemption: jest.fn(),
    getRedemptionStatus: jest.fn(),
  };
}

function renderDetail() {
  mockAuthValue = authValue();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CafeDetailScreen />
    </QueryClientProvider>,
  );
}

describe('CafeDetailScreen', () => {
  beforeEach(() => {
    mockRejectDetail = null;
    mockCafeDetail = CAFE_DETAIL;
    mockMembership = VISITOR_MEMBERSHIP;
    mockPush.mockClear();
  });

  it('renders cafe information and the menu with prices', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Blackwood Roasting Co.')).toBeTruthy());

    expect(screen.getByText('Bishop Arts District')).toBeTruthy();
    expect(screen.getByText('408 N Bishop Ave, Dallas, TX')).toBeTruthy();
    expect(screen.getByText('Open now')).toBeTruthy();
    expect(screen.getByText('Oat Milk Cortado')).toBeTruthy();
    expect(screen.getByText(/5 credits/)).toBeTruthy();
    expect(screen.getByText(/\$5\.00 retail/)).toBeTruthy();
    expect(screen.getByText('Signature')).toBeTruthy();
  });

  it('sends a Visitor to the membership screen when Redeem is tapped (ADR-0008)', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('redeem-join')).toBeTruthy());

    fireEvent.press(screen.getByTestId('redeem-join'));
    expect(mockPush).toHaveBeenCalledWith('/membership');
  });

  it('opens the drink picker and navigates into the redemption flow for a Member with credits (PRD Module 8)', async () => {
    mockMembership = {
      isMember: true,
      status: 'active',
      credits: 30,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    renderDetail();

    await waitFor(() => expect(screen.getByTestId('redeem-here')).toBeTruthy());
    expect(screen.queryByTestId('redeem-join')).toBeNull();

    fireEvent.press(screen.getByTestId('redeem-here'));
    fireEvent.press(screen.getByTestId('redeem-picker-row'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/redeem/[drinkId]',
      params: {
        drinkId: 'drink-1',
        drinkName: 'Oat Milk Cortado',
        cafeId: 'cafe-1',
        cafeName: 'Blackwood Roasting Co.',
        creditPrice: '5',
      },
    });
  });

  it('disables redeem with a zero-credits message for a Member with no credits left', async () => {
    mockMembership = {
      isMember: true,
      status: 'active',
      credits: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    renderDetail();

    await waitFor(() => expect(screen.getByText('No credits left')).toBeTruthy());
  });

  it('shows a not-found state for a missing cafe', async () => {
    mockRejectDetail = new ApiError(404, 'NOT_FOUND', 'Cafe not found');

    renderDetail();
    await waitFor(() => expect(screen.getByText('This café is no longer available')).toBeTruthy());
  });

  it("shows each drink's average rating on the menu", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText(/4\.5 \(2\)/)).toBeTruthy());
  });

  it("navigates to the rating screen when a menu drink's Rate action is pressed", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('menu-drink-rate')).toBeTruthy());

    fireEvent.press(screen.getByTestId('menu-drink-rate'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/rate/[drinkId]',
      params: {
        drinkId: 'drink-1',
        drinkName: 'Oat Milk Cortado',
        cafeName: 'Blackwood Roasting Co.',
      },
    });
  });

  it('opens a drink picker from "Rate a drink" and navigates on selection', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('cafe-rate-a-drink')).toBeTruthy());

    fireEvent.press(screen.getByTestId('cafe-rate-a-drink'));
    fireEvent.press(screen.getByTestId('drink-picker-row'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/rate/[drinkId]',
      params: {
        drinkId: 'drink-1',
        drinkName: 'Oat Milk Cortado',
        cafeName: 'Blackwood Roasting Co.',
      },
    });
  });
});
