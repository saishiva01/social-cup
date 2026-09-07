import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      // The API answers identically whether or not the account exists.
      await forgotPassword(email.trim());
      setSent(true);
    } finally {
      setBusy(false);
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
            <ThemedText type="subtitle">Reset your password</ThemedText>

            {sent ? (
              <>
                <ThemedText type="default" style={styles.body}>
                  If an account exists for that email, we&apos;ve sent a password reset link. The
                  link expires in 1 hour.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  <Link href="/login">Back to sign in</Link>
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
                  Enter the email you signed up with and we&apos;ll send you a reset link.
                </ThemedText>
                <FormField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  testID="forgot-email"
                />
                <PrimaryButton
                  label="Send reset link"
                  busy={busy}
                  onPress={handleSubmit}
                  testID="forgot-submit"
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  <Link href="/login">Back to sign in</Link>
                </ThemedText>
              </>
            )}
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
  body: {
    marginBottom: Spacing.four,
  },
  centered: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});
