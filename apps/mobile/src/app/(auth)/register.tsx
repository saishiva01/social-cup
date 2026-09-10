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

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    if (busy) return;
    // Catching an obviously-too-short password client-side avoids a wasted
    // round trip for the single rule the server actually enforces.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setPasswordError(null);
    setBusy(true);
    setError(null);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <ScreenContainer header>
        <ThemedText type="subtitle">Check your email</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          We&apos;ve sent a verification link to{' '}
          <ThemedText type="default">{email.trim()}</ThemedText>. Open it on this device to confirm
          your account, then come back and sign in.
        </ThemedText>
        <ThemedText type="small" style={styles.centered}>
          <Link href="/login">Back to sign in</Link>
        </ThemedText>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">Create your account</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        Free to browse, rate, and build your diary.
      </ThemedText>

      <SocialSignIn />

      <FormField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
        testID="register-name"
      />
      <FormField
        ref={emailRef}
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
        testID="register-email"
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError(null);
        }}
        error={passwordError ?? undefined}
        helperText={passwordError ? undefined : 'Minimum 8 characters.'}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        testID="register-password"
      />

      {error ? (
        <StatusMessage variant="error" testID="register-error">
          {error}
        </StatusMessage>
      ) : null}

      <PrimaryButton
        label="Create account"
        busy={busy}
        onPress={handleSubmit}
        testID="register-submit"
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        Already have an account? <Link href="/login">Sign in</Link>
      </ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
});
