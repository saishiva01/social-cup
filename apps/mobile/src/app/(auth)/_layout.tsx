import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';

/**
 * Sign-in / sign-up group. Shown while unauthenticated; an authenticated
 * user who lands here (e.g. a stale deep link, or navigating back after
 * logging in on another tab) is bounced to the home screen instead of
 * seeing a login form for an account they're already signed into.
 */
export default function AuthLayout() {
  const { status } = useAuth();

  if (status === 'authenticated') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
