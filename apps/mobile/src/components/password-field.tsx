import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { FormField, type FormFieldProps } from '@/components/form-field';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';

type PasswordFieldProps = Omit<FormFieldProps, 'secureTextEntry' | 'accessoryRight'>;

/**
 * A FormField specialized for passwords: masked by default, with a
 * text-based "Show"/"Hide" toggle (no icon dependency — keeps this Expo Go
 * compatible without adding an icon-pack install) rather than forcing the
 * user to type blind or leave it permanently visible.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { textContentType = 'password', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField
      ref={ref}
      textContentType={textContentType}
      secureTextEntry={!visible}
      accessoryRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
          style={styles.toggle}
        >
          <ThemedText type="smallBold" themeColor="primary">
            {visible ? 'Hide' : 'Show'}
          </ThemedText>
        </Pressable>
      }
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  toggle: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
