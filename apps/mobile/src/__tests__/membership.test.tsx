import type { MembershipStatusResult } from '@social-cup/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MembershipScreen from '../app/membership';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
const mockGetMembership = jest.fn();
const mockSubscribeMembership = jest.fn();
const mockCreateBillingPortalSession = jest.fn();
const mockInitPaymentSheet = jest.fn();
const mockPresentPaymentSheet = jest.fn();
const mockOpenBrowserAsync = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>redirect:{href}</Text>;
  },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('@stripe/stripe-react-native', () => ({
  useStripe: () => ({
    initPaymentSheet: mockInitPaymentSheet,
    presentPaymentSheet: mockPresentPaymentSheet,
  }),
}));

const VISITOR: MembershipStatusResult = {
  isMember: false,
  status: 'incomplete',
  credits: 0,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

const ACTIVE_MEMBER: MembershipStatusResult = {
  isMember: true,
  status: 'active',
  credits: 30,
  currentPeriodEnd: '2026-11-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
};

function authValue(): AuthContextValue {
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
    getCafes: jest.fn(),
    getFeaturedCafes: jest.fn(),
    getSignatureDrinks: jest.fn(),
    getNeighborhoods: jest.fn(),
    getCafeDetail: jest.fn(),
    getMyRating: jest.fn(),
    rateDrink: jest.fn(),
    getDiary: jest.fn(),
    getMembership: mockGetMembership,
    subscribeMembership: mockSubscribeMembership,
    createBillingPortalSession: mockCreateBillingPortalSession,
    createRedemption: jest.fn(),
    getRedemptionStatus: jest.fn(),
  };
}

function renderMembership() {
  mockAuthValue = authValue();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipScreen />
    </QueryClientProvider>,
  );
}

describe('MembershipScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to sign-in when there is no authenticated session', () => {
    mockAuthValue = { ...authValue(), status: 'unauthenticated', user: null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MembershipScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByText('redirect:/login')).toBeTruthy();
  });

  it('shows a loading state while membership status is being fetched', () => {
    mockGetMembership.mockReturnValue(new Promise(() => {})); // never resolves
    renderMembership();
    expect(screen.getByTestId('membership-loading')).toBeTruthy();
  });

  it('shows an error state with retry when the status fetch fails', async () => {
    mockGetMembership.mockRejectedValue(new Error('network down'));
    renderMembership();
    await waitFor(() => expect(screen.getByTestId('membership-error')).toBeTruthy());
  });

  it('shows the plan, price, and a Subscribe CTA for a Visitor', async () => {
    mockGetMembership.mockResolvedValue(VISITOR);
    renderMembership();

    await waitFor(() => expect(screen.getByTestId('membership-not-member')).toBeTruthy());
    expect(screen.getByText('$24.99/month')).toBeTruthy();
    expect(screen.getByText(/30 drink credits/)).toBeTruthy();
    expect(screen.getByText(/1 credit is always worth \$1/)).toBeTruthy();
    expect(screen.getByTestId('membership-subscribe')).toBeTruthy();
  });

  it('shows the credit balance and renewal date for an active Member', async () => {
    mockGetMembership.mockResolvedValue(ACTIVE_MEMBER);
    renderMembership();

    await waitFor(() => expect(screen.getByTestId('membership-active')).toBeTruthy());
    expect(screen.getByTestId('membership-credits')).toHaveTextContent('30 credits available');
    expect(screen.getByText(/Renews/)).toBeTruthy();
    expect(screen.getByTestId('membership-manage-billing')).toBeTruthy();
  });

  it('shows a past-due notice with an update-payment-method action instead of Subscribe', async () => {
    mockGetMembership.mockResolvedValue({
      ...ACTIVE_MEMBER,
      isMember: false,
      status: 'past_due',
      credits: 0,
    });
    renderMembership();

    await waitFor(() => expect(screen.getByTestId('membership-past-due')).toBeTruthy());
    expect(screen.getByTestId('membership-update-card')).toBeTruthy();
    expect(screen.queryByTestId('membership-subscribe')).toBeNull();
  });

  it('initializes and presents the Stripe PaymentSheet, then refreshes status until the member becomes active', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockGetMembership
      .mockResolvedValueOnce(VISITOR)
      .mockResolvedValueOnce(VISITOR) // still processing after PaymentSheet success
      .mockResolvedValueOnce(ACTIVE_MEMBER); // webhook has landed
    mockSubscribeMembership.mockResolvedValue({
      paymentIntentClientSecret: 'pi_test_secret',
      ephemeralKeySecret: 'ek_test',
      customerId: 'cus_test',
      subscriptionId: 'sub_test',
    });
    mockInitPaymentSheet.mockResolvedValue({});
    mockPresentPaymentSheet.mockResolvedValue({});

    renderMembership();
    await waitFor(() => expect(screen.getByTestId('membership-subscribe')).toBeTruthy());

    fireEvent.press(screen.getByTestId('membership-subscribe'));

    await waitFor(() => expect(mockSubscribeMembership).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockInitPaymentSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cus_test',
          customerEphemeralKeySecret: 'ek_test',
          paymentIntentClientSecret: 'pi_test_secret',
        }),
      ),
    );
    await waitFor(() => expect(mockPresentPaymentSheet).toHaveBeenCalled());

    await jest.runAllTimersAsync();

    await waitFor(() => expect(screen.getByTestId('membership-active')).toBeTruthy());
    jest.useRealTimers();
  });

  it('shows a payment error when PaymentSheet presentation fails', async () => {
    mockGetMembership.mockResolvedValue(VISITOR);
    mockSubscribeMembership.mockResolvedValue({
      paymentIntentClientSecret: 'pi_test_secret',
      ephemeralKeySecret: 'ek_test',
      customerId: 'cus_test',
      subscriptionId: 'sub_test',
    });
    mockInitPaymentSheet.mockResolvedValue({});
    mockPresentPaymentSheet.mockResolvedValue({
      error: { code: 'Failed', message: 'Your card was declined.' },
    });

    renderMembership();
    await waitFor(() => expect(screen.getByTestId('membership-subscribe')).toBeTruthy());
    fireEvent.press(screen.getByTestId('membership-subscribe'));

    await waitFor(() =>
      expect(screen.getByTestId('membership-subscribe-error')).toHaveTextContent(
        'Your card was declined.',
      ),
    );
  });

  it('shows no error when the member cancels out of PaymentSheet', async () => {
    mockGetMembership.mockResolvedValue(VISITOR);
    mockSubscribeMembership.mockResolvedValue({
      paymentIntentClientSecret: 'pi_test_secret',
      ephemeralKeySecret: 'ek_test',
      customerId: 'cus_test',
      subscriptionId: 'sub_test',
    });
    mockInitPaymentSheet.mockResolvedValue({});
    mockPresentPaymentSheet.mockResolvedValue({ error: { code: 'Canceled', message: 'Canceled' } });

    renderMembership();
    await waitFor(() => expect(screen.getByTestId('membership-subscribe')).toBeTruthy());
    fireEvent.press(screen.getByTestId('membership-subscribe'));

    await waitFor(() => expect(mockPresentPaymentSheet).toHaveBeenCalled());
    expect(screen.queryByTestId('membership-subscribe-error')).toBeNull();
  });

  it('opens the Stripe billing portal when Manage billing is pressed', async () => {
    mockGetMembership.mockResolvedValue(ACTIVE_MEMBER);
    mockCreateBillingPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/session/abc',
    });

    renderMembership();
    await waitFor(() => expect(screen.getByTestId('membership-manage-billing')).toBeTruthy());
    fireEvent.press(screen.getByTestId('membership-manage-billing'));

    await waitFor(() =>
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://billing.stripe.com/session/abc'),
    );
  });
});
