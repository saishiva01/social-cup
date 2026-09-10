/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/**
 * Semantic color tokens. Screens should always read a role (`primary`,
 * `error`, `textMuted`, ...) via useTheme()/ThemedText/ThemedView rather
 * than hard-coding a hex value — that's what keeps every screen visually
 * consistent and theme-aware in one place. `#208AEF` is the established
 * Social Cup brand blue (already used for the splash screen in app.json);
 * `error`/`success` match the colors already used ad hoc across the Phase 1
 * auth screens, promoted here so they're defined once.
 */
export const Colors = {
  light: {
    text: '#211F15',
    textSecondary: '#6E6F57',
    textMuted: '#9A9884',
    background: '#F8F6EF',
    surface: '#F1EEE3',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECE8D8',
    border: '#DAD6C4',
    primary: '#7C8B4A',
    primaryPressed: '#6C7A3E',
    primaryText: '#1F2410',
    error: '#C1442C',
    success: '#188038',
    disabled: '#D8D5C2',
  },
  dark: {
    text: '#F5F3E8',
    textSecondary: '#C7C6B0',
    textMuted: '#8F8D78',
    background: '#17160F',
    surface: '#201F16',
    backgroundElement: '#242316',
    backgroundSelected: '#2E2C1C',
    border: '#3A3826',
    primary: '#9BB06A',
    primaryPressed: '#84995A',
    primaryText: '#141508',
    error: '#FF6B60',
    success: '#4ECB77',
    disabled: '#41442A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Custom Google Fonts loaded in the root layout (see useFonts in _layout.tsx). */
export const BrandFonts = {
  script: 'Pacifico_400Regular',
  serif: 'Lora_400Regular',
  serifBold: 'Lora_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 480;

/** Corner-radius scale — inputs/buttons use `sm`, cards/containers use `md`/`lg`. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum comfortable touch target (Apple HIG / Material both recommend ~44-48pt). */
export const MinTouchTarget = 44;
