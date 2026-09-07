import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

/**
 * Reached from the verification email link (deep link
 * socialcup://verify-email?token=...). The token comes from the URL and is
 * handed to the API once — it is never persisted on device.
 */
export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { verifyEmail } = useAuth();
  const [state, setState] = useState<'verifying' | 'success' | 'failed'>('verifying');

  useEffect(() => {
    if (!token) {
      setState('failed');
      return;
    }
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {state === 'verifying' ? (
            <>
              <ActivityIndicator size="large" />
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
              <ThemedText type="default" style={styles.body}>
                Your account is ready. You can now sign in.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                <Link href="/login">Sign in</Link>
              </ThemedText>
            </>
          ) : null}

          {state === 'failed' ? (
            <>
              <ThemedText type="subtitle" style={styles.title}>
                Verification link invalid
              </ThemedText>
              <ThemedText type="default" style={styles.body}>
                This link is invalid or has expired. You can sign in and request a new one from the
                sign-in screen.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                <Link href="/login">Go to sign in</Link>
              </ThemedText>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    justifyContent: 'center',
    flexGrow: 1,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
});
