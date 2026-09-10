import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface PrimaryButtonProps extends Omit<PressableProps, 'style' | 'disabled' | 'onPress'> {
  label: string;
  /** Shows a spinner and disables the button — also guards against a double-tap firing a second request. */
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one button component for every Phase 1 screen. `variant="secondary"`
 * is an outlined/quiet action (e.g. a non-destructive secondary choice);
 * `variant="danger"` is for sign-out — both share the same sizing/radius/
 * typography as the primary action so buttons never look like they belong
 * to different apps from screen to screen.
 */
export function PrimaryButton({
  label,
  busy = false,
  disabled = false,
  variant = 'primary',
  style,
  onPress,
  ...pressableProps
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || busy;

  const backgroundColor = isDisabled
    ? theme.disabled
    : variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.error
        : 'transparent';
  const borderColor = variant === 'secondary' ? theme.border : backgroundColor;
  const labelColor =
    variant === 'secondary' && !isDisabled
      ? theme.text
      : variant === 'primary' && !isDisabled
        ? theme.primaryText
        : '#ffffff';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      // Disabling on press (not just visually) is what actually prevents a
      // fast double-tap from firing the request twice before state re-renders.
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      {...pressableProps}
    >
      {busy ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <ThemedText type="smallBold" style={[styles.label, { color: labelColor }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MinTouchTarget,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 16,
  },
});
