import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '../app/(auth)/login';
import { ApiError } from '../lib/api';

const mockLogin = jest.fn();
const mockResendVerification = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    login: mockLogin,
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: mockResendVerification,
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    updateProfile: jest.fn(),
    refreshSession: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits email and password to the auth context', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('login-email'), 'Ada@Example.COM');
    fireEvent.changeText(screen.getByTestId('login-password'), 'correct-horse');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('Ada@Example.COM', 'correct-horse'));
  });

  it('shows a verification prompt and resend flow for an unverified account', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address before signing in'),
    );
    mockResendVerification.mockResolvedValueOnce(undefined);

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'ada@example.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'correct-horse');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(screen.getByText('Please verify your email address before signing in.')).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('Resend it'));
    await waitFor(() => expect(mockResendVerification).toHaveBeenCalledWith('ada@example.com'));
    expect(screen.getByTestId('resend-confirmation')).toBeTruthy();
  });

  it('shows a generic message for a wrong password', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));
    render(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('login-email'), 'ada@example.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'wrong');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());
    // No resend offer for a plain credential failure.
    expect(screen.queryByText('Resend it')).toBeNull();
  });

  it('renders Google and Apple as disabled placeholders that cannot authenticate', () => {
    render(<LoginScreen />);
    const google = screen.getByText('Continue with Google');
    const apple = screen.getByText('Continue with Apple');
    expect(google).toBeTruthy();
    expect(apple).toBeTruthy();

    fireEvent.press(google);
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
