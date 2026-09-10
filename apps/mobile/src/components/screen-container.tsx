import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';

interface ScreenContainerProps {
  children: ReactNode;
  /** Vertically centers content — the right default for short auth forms. Set false for longer, scroll-from-top content like the profile screen. */
  center?: boolean;
  /** Shows the back-arrow row used at the top of every Phase 1 auth screen. */
  header?: boolean;
}

/**
 * The shared screen shell for every Phase 1 auth/profile screen: safe-area
 * insets, keyboard avoidance, a scroll view that never lets the keyboard
 * cover the active field or the primary CTA, and one consistent horizontal
 * margin/max content width so every screen lines up with every other one
 * (including on a tablet or the web preview, where an edge-to-edge form
 * would otherwise stretch unreadably wide).
 */
export function ScreenContainer({ children, center = true, header = false }: ScreenContainerProps) {
  const router = useRouter();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {header && router.canGoBack() ? (
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <ThemedText type="default" style={styles.backArrow}>
                ←
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.content, center && styles.centered]}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  centered: {
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  headerButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 22,
  },
});
