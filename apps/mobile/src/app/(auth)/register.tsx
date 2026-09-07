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

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit() {
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
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle">Check your email</ThemedText>
            <ThemedText type="default" style={styles.body}>
              We&apos;ve sent a verification link to {email.trim()}. Click it to finish creating
              your account, then sign in.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              <Link href="/login">Back to sign in</Link>
            </ThemedText>
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
            <ThemedText type="subtitle">Create your account</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Join Social Cup — $24.99/month for 30 drink credits, whenever you&apos;re ready.
            </ThemedText>

            <FormField
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              autoComplete="name"
              textContentType="name"
              testID="register-name"
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              testID="register-email"
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              testID="register-password"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Minimum 8 characters.
            </ThemedText>

            {error ? (
              <ThemedText type="small" style={styles.error} testID="register-error">
                {error}
              </ThemedText>
            ) : null}

            <PrimaryButton
              label="Create account"
              busy={busy}
              onPress={handleSubmit}
              testID="register-submit"
            />

            <SocialSignIn />

            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Already have an account? <Link href="/login">Sign in</Link>
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
  body: {
    marginBottom: Spacing.four,
  },
  error: {
    color: '#D93025',
    marginBottom: Spacing.two,
  },
  centered: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
