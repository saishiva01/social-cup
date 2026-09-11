import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface StatusMessageProps {
  variant: 'error' | 'success';
  children: string;
  testID?: string;
}

/**
 * The single error/success treatment used across every Phase 1 auth screen.
 * The rendered text is exactly `children` (screens pass the server/validation
 * message verbatim, and existing tests assert on that exact string) — the
 * error-vs-success distinction for assistive tech comes from
 * `accessibilityLabel` and `accessibilityRole="alert"`, not from prepending
 * a visible glyph, so it never relies on color alone without changing what
 * sighted users read. `accessibilityLiveRegion` makes a screen reader
 * announce it as soon as it appears — both variants show up asynchronously,
 * after a submit.
 */
export function StatusMessage({ variant, children, testID }: StatusMessageProps) {
  const theme = useTheme();
  const color = variant === 'error' ? theme.error : theme.success;

  return (
    <View style={styles.row}>
      <Ionicons
        name={variant === 'error' ? 'alert-circle' : 'checkmark-circle'}
        size={16}
        color={color}
        style={styles.icon}
      />
      <ThemedText
        type="small"
        style={[styles.text, { color }]}
        accessibilityLiveRegion="polite"
        accessibilityRole={variant === 'error' ? 'alert' : 'text'}
        accessibilityLabel={`${variant === 'error' ? 'Error' : 'Success'}: ${children}`}
        testID={testID}
      >
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  icon: {
    marginTop: 2,
  },
  text: {
    flex: 1,
  },
});
