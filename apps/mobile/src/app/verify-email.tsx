import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Reached from the verification email link (deep link
 * socialcup://verify-email?token=...). The token comes from the URL and is
 * handed to the API once — it is never persisted on device.
 */
export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { verifyEmail } = useAuth();
  const theme = useTheme();
  const [state, setState] = useState<'verifying' | 'success' | 'failed'>(
    token ? 'verifying' : 'failed',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token, verifyEmail]);

  return (
    <ScreenContainer header>
      {state === 'verifying' ? (
        <>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="subtitle" style={styles.title}>
            Verifying your email…
          </ThemedText>
        </>
      ) : null}

      {state === 'success' ? (
        <>
          <ThemedText type="subtitle" style={styles.title}>
            Email verified
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            Your account is ready. You can now sign in.
          </ThemedText>
          <ThemedText type="small" style={styles.centered}>
            <Link href="/login">Sign in</Link>
          </ThemedText>
        </>
      ) : null}

      {state === 'failed' ? (
        <>
          <ThemedText type="subtitle" style={styles.title}>
            Verification link invalid
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            This link is invalid or has expired. Sign in with your email and password and we&apos;ll
            offer to resend a fresh verification link.
          </ThemedText>
          <ThemedText type="small" style={styles.centered}>
            <Link href="/login">Go to sign in</Link>
          </ThemedText>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginTop: -Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
});
