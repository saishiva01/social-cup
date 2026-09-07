import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';

interface FormFieldProps extends TextInputProps {
  label: string;
}

/** A labeled text input with theme-aware colors — the shared auth form field. */
export function FormField({ label, style, ...inputProps }: FormFieldProps) {
  const theme = useTheme();

  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.backgroundSelected,
          },
          style,
        ]}
        {...inputProps}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
    fontSize: 16,
    marginTop: Spacing.one,
    marginBottom: Spacing.three,
  },
});
