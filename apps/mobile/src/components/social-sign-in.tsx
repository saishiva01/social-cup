import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Google / Apple sign-in are PLACEHOLDERS ONLY in Phase 1 — see
 * docs/architecture/authentication.md. They are rendered per the design but
 * disabled ("coming soon"), and can never perform authentication or create
 * accounts. No OAuth credentials or backend verification exist; do not wire
 * an onPress that simulates success.
 */
export function SocialSignIn() {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.divider}>
        — or —
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.socialButton}
      >
        <ThemedText type="smallBold">Continue with Google</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Coming soon
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={styles.socialButton}
      >
        <ThemedText type="smallBold">Continue with Apple</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Coming soon
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    marginVertical: Spacing.four,
  },
  divider: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  socialButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    gap: Spacing.half,
    opacity: 0.6,
    backgroundColor: undefined,
  },
});
