import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/auth-context';

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      // The API answers identically whether or not the account exists —
      // the UI must not imply otherwise.
      await forgotPassword(email.trim());
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <ScreenContainer header center={false}>
        <ThemedText type="subtitle">Check your email</ThemedText>
        <StatusMessage variant="success">
          If an account exists for that email, we&apos;ve sent a password reset link. It expires in
          1 hour.
        </StatusMessage>
        <ThemedText type="small" style={styles.centered}>
          <Link href="/login">Back to sign in</Link>
        </ThemedText>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">Reset your password</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
      </ThemedText>
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
});
