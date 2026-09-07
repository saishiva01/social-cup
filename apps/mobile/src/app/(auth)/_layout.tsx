import { Stack } from 'expo-router';

/** Sign-in / sign-up group. Screens here are shown while unauthenticated. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
