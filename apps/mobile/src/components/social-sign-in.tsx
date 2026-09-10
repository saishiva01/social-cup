import { Pressable, StyleSheet, View } from 'react-native';

import { AppleIcon } from '@/components/icons/apple-icon';
import { GoogleIcon } from '@/components/icons/google-icon';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SocialSignInProps {
  /** "Continue with" (registration) or "Sign in with" (login) — the only copy difference between screens. */
  verb?: 'Continue with' | 'Sign in with';
}

/**
 * Google / Apple sign-in are PLACEHOLDERS ONLY in Phase 1 — see
 * docs/architecture/authentication.md. They are rendered per the design but
 * disabled, and can never perform authentication or create accounts. No
 * OAuth credentials or backend verification exist; do not wire an onPress
 * that simulates success. `accessibilityHint` discloses the "coming soon"
 * state to assistive tech without adding visible label text the approved
 * design doesn't show.
 */
export function SocialSignIn({ verb = 'Continue with' }: SocialSignInProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${verb} Google`}
        accessibilityHint="Coming soon — not yet available"
        accessibilityState={{ disabled: true }}
        disabled
        style={[
          styles.socialButton,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <GoogleIcon size={20} />
        <ThemedText type="smallBold">{verb} Google</ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${verb} Apple`}
        accessibilityHint="Coming soon — not yet available"
        accessibilityState={{ disabled: true }}
        disabled
        style={[styles.socialButton, styles.appleButton]}
      >
        <AppleIcon size={20} color="#FFFFFF" />
        <ThemedText type="smallBold" style={styles.appleLabel}>
          {verb} Apple
        </ThemedText>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        <ThemedText type="small" themeColor="textMuted" style={styles.dividerLabel}>
          or
        </ThemedText>
        <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.half,
    marginBottom: Spacing.one,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    flexShrink: 0,
  },
  socialButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.pill,
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  appleButton: {
    backgroundColor: '#211F15',
    borderColor: '#211F15',
  },
  appleLabel: {
    color: '#FFFFFF',
  },
});
