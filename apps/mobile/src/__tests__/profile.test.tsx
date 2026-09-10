import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ProfileScreen from '../app/profile';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: AuthContextValue;
const mockUpdateProfile = jest.fn();
const mockLogout = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>redirect:{href}</Text>;
  },
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: 'authenticated',
    user: {
      id: 'u-1',
      email: 'ada@example.com',
      displayName: 'Ada',
      profilePhotoUrl: null,
      coffeePreferences: ['latte'],
      neighborhood: 'Bishop Arts District',
      emailVerified: true,
      role: 'user',
    },
    login: jest.fn(),
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: mockLogout,
    updateProfile: mockUpdateProfile,
    refreshSession: jest.fn(),
    getCafes: jest.fn(),
    getFeaturedCafes: jest.fn(),
    getSignatureDrinks: jest.fn(),
    getNeighborhoods: jest.fn(),
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

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to sign-in when there is no authenticated session', () => {
    mockAuthValue = authValue({ status: 'unauthenticated', user: null });
    render(<ProfileScreen />);
    expect(screen.getByText('redirect:/login')).toBeTruthy();
  });

  it('renders the current profile with email read-only', () => {
    mockAuthValue = authValue({});
    render(<ProfileScreen />);

    expect(screen.getByTestId('profile-name').props.value).toBe('Ada');
    expect(screen.getByTestId('profile-neighborhood').props.value).toBe('Bishop Arts District');
    const emailField = screen.getByTestId('profile-email');
    expect(emailField.props.value).toBe('ada@example.com');
    expect(emailField.props.editable).toBe(false);
  });

  it('saves edits and shows confirmation', async () => {
    mockAuthValue = authValue({});
    mockUpdateProfile.mockResolvedValueOnce(undefined);
    render(<ProfileScreen />);

    fireEvent.changeText(screen.getByTestId('profile-name'), 'Ada Lovelace');
    fireEvent.press(screen.getByTestId('pref-espresso'));
    fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Ada Lovelace',
          coffeePreferences: expect.arrayContaining(['latte', 'espresso']),
        }),
      ),
    );
    expect(screen.getByTestId('profile-saved')).toBeTruthy();
  });

  it('signs out via the account-actions button', () => {
    mockAuthValue = authValue({});
    render(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('profile-logout'));
    expect(mockLogout).toHaveBeenCalled();
  });
});
