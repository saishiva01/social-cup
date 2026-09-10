import { ThemedText } from '@/components/themed-text';
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
    <ThemedText
      type="small"
      style={{ color }}
      accessibilityLiveRegion="polite"
      accessibilityRole={variant === 'error' ? 'alert' : 'text'}
      accessibilityLabel={`${variant === 'error' ? 'Error' : 'Success'}: ${children}`}
      testID={testID}
    >
      {children}
    </ThemedText>
  );
}
