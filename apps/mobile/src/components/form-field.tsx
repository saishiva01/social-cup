import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface FormFieldProps extends TextInputProps {
  label: string;
  /** Field-level validation message. Shown in the error color and read by screen readers. */
  error?: string;
  /** Shown instead of `error` when there isn't one — e.g. "Minimum 8 characters." */
  helperText?: string;
  /** Rendered inside the input's border, right-aligned — used for the password show/hide toggle. */
  accessoryRight?: ReactNode;
}

/**
 * The shared labeled text input for every Phase 1 form. A real label (not a
 * placeholder standing in for one) stays visible once the field is focused
 * or filled, and doubles as the accessible name. `error`/`helperText` render
 * in the same slot so a field never shows both, keeping vertical rhythm
 * predictable across screens.
 */
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, error, helperText, accessoryRight, style, placeholderTextColor, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const hasError = Boolean(error);

  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold" themeColor="text">
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: hasError ? theme.error : theme.border,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={placeholderTextColor ?? theme.textMuted}
          style={[styles.input, { color: theme.text }, style]}
          {...inputProps}
        />
        {accessoryRight}
      </View>
      {hasError ? (
        <ThemedText type="small" style={{ color: theme.error }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText type="small" themeColor="textMuted">
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.half,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
