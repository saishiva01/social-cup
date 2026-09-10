import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { SocialSignIn } from '@/components/social-sign-in';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginScreen() {
  const { login, resendVerification } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const showResend = error !== null && error.includes('verify your email');

  async function handleSubmit() {
    if (busy) return;
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
    if (resendBusy) return;
    setResendBusy(true);
    setResendSent(false);
    try {
      await resendVerification(email.trim());
      setResendSent(true);
    } catch {
      setError('Could not resend the verification email. Please try again.');
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">Welcome back</ThemedText>

      <SocialSignIn verb="Sign in with" />

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
        testID="login-email"
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        testID="login-password"
      />

      <ThemedText type="small" style={styles.forgotLink}>
        <Link href="/forgot-password">Forgot password?</Link>
      </ThemedText>

      {error ? (
        <StatusMessage variant="error" testID="login-error">
          {error}
        </StatusMessage>
      ) : null}
      {resendSent ? (
        <StatusMessage variant="success" testID="resend-confirmation">
          Verification email sent — check your inbox.
        </StatusMessage>
      ) : null}
      {showResend ? (
        <ThemedText type="small" themeColor="textSecondary">
          Didn&apos;t get the email?{' '}
          <ThemedText type="linkPrimary" onPress={handleResend} suppressHighlighting>
            {resendBusy ? 'Sending…' : 'Resend it'}
          </ThemedText>
        </ThemedText>
      ) : null}

      <PrimaryButton label="Log in" busy={busy} onPress={handleSubmit} testID="login-submit" />

      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
  forgotLink: {
    textAlign: 'right',
  },
});
