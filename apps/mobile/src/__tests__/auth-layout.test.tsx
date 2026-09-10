import { render, screen } from '@testing-library/react-native';

import AuthLayout from '../app/(auth)/_layout';
import type { AuthContextValue } from '../contexts/auth-context';

let mockAuthValue: Partial<AuthContextValue>;

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValue,
}));

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>redirect:{href}</Text>;
  },
  Stack: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>auth-stack</Text>;
  },
}));

describe('AuthLayout', () => {
  it('renders the auth stack when unauthenticated', () => {
    mockAuthValue = { status: 'unauthenticated' };
    render(<AuthLayout />);
    expect(screen.getByText('auth-stack')).toBeTruthy();
  });

  it('redirects home instead of showing auth screens for an authenticated session', () => {
    mockAuthValue = { status: 'authenticated' };
    render(<AuthLayout />);
    expect(screen.getByText('redirect:/')).toBeTruthy();
    expect(screen.queryByText('auth-stack')).toBeNull();
  });
});
