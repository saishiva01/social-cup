import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Reached from the email link (deep link socialcup://reset-password?token=...)
 * or directly. The token comes from the URL — it is never persisted.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  if (!token) {
    return (
      <ScreenContainer header center={false}>
        <ThemedText type="subtitle">Invalid link</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          This password reset link is missing its token. Request a new one and try again.
        </ThemedText>
        <ThemedText type="small" style={styles.centered}>
          <Link href="/forgot-password">Request a new link</Link>
        </ThemedText>
      </ScreenContainer>
    );
  }

  // Re-bound after the guard so the hoisted handler closure sees `string`,
  // not `string | undefined` (function declarations are hoisted past the
  // narrowing above).
  const resetToken = token;

  async function handleSubmit() {
    if (busy) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(resetToken, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <ScreenContainer header center={false}>
        <ThemedText type="subtitle">Password updated</ThemedText>
        <StatusMessage variant="success">
          Your password has been reset. Sign in with your new password.
        </StatusMessage>
        <PrimaryButton
          label="Sign in"
          onPress={() => router.replace('/login')}
          testID="reset-done"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">Choose a new password</ThemedText>

      <PasswordField
        label="New password"
        value={password}
        onChangeText={setPassword}
        helperText={error ? undefined : 'Minimum 8 characters.'}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => confirmRef.current?.focus()}
        testID="reset-password"
      />
      <PasswordField
        ref={confirmRef}
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        testID="reset-confirm"
      />

      {error ? (
        <StatusMessage variant="error" testID="reset-error">
          {error}
        </StatusMessage>
      ) : null}

      <PrimaryButton
        label="Update password"
        busy={busy}
        onPress={handleSubmit}
        testID="reset-submit"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
});
