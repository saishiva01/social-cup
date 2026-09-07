import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { SocialSignIn } from '@/components/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const { login, resendVerification } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setResendSent(false);
    try {
      await login(email.trim(), password);
      // The home screen observes the authenticated state and takes over.
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email address before signing in.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setResendSent(false);
    try {
      await resendVerification(email.trim());
      setResendSent(true);
    } catch {
      setError('Could not resend the verification email. Please try again.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Welcome back</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Sign in to your Social Cup account
            </ThemedText>

            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              testID="login-email"
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              testID="login-password"
            />

            {error ? (
              <ThemedText type="small" style={styles.error} testID="login-error">
                {error}
              </ThemedText>
            ) : null}

            {resendSent ? (
              <ThemedText type="small" style={styles.success} testID="resend-confirmation">
                Verification email sent — check your inbox.
              </ThemedText>
            ) : null}

            <PrimaryButton
              label="Sign in"
              busy={busy}
              onPress={handleSubmit}
              testID="login-submit"
            />

            {error?.includes('verify your email') ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                Didn&apos;t get the email?{' '}
                <ThemedText type="linkPrimary" onPress={handleResend}>
                  Resend it
                </ThemedText>
              </ThemedText>
            ) : null}

            <SocialSignIn />

            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              <Link href="/forgot-password">Forgot password?</Link>
              {'  ·  '}
              <Link href="/register">Create an account</Link>
            </ThemedText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.one,
    justifyContent: 'center',
    flexGrow: 1,
  },
  subtitle: {
    marginBottom: Spacing.four,
  },
  error: {
    color: '#D93025',
    marginBottom: Spacing.two,
  },
  success: {
    color: '#188038',
    marginBottom: Spacing.two,
  },
  centered: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
