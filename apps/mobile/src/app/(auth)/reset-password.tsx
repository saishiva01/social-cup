import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

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

  if (!token) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle">Invalid link</ThemedText>
            <ThemedText type="default" style={styles.body}>
              This password reset link is missing its token. Request a new one and try again.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              <Link href="/forgot-password">Request a new link</Link>
            </ThemedText>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Re-bound after the guard so the hoisted handler closure sees `string`,
  // not `string | undefined` (function declarations are hoisted past the
  // narrowing above).
  const resetToken = token;

  async function handleSubmit() {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle">Password updated</ThemedText>
            <ThemedText type="default" style={styles.body}>
              Your password has been reset. Sign in with your new password.
            </ThemedText>
            <PrimaryButton
              label="Sign in"
              onPress={() => router.replace('/login')}
              testID="reset-done"
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Choose a new password</ThemedText>

            <FormField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              testID="reset-password"
            />
            <FormField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="newPassword"
              testID="reset-confirm"
            />

            {error ? (
              <ThemedText type="small" style={styles.error} testID="reset-error">
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton
              label="Update password"
              busy={busy}
              onPress={handleSubmit}
              testID="reset-submit"
            />
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
  body: {
    marginBottom: Spacing.four,
  },
  error: {
    color: '#D93025',
    marginBottom: Spacing.two,
  },
});
