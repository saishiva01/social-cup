import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
}

/** A single pulsing placeholder block — used to compose loading-state layouts. */
export function Skeleton({ style }: SkeletonProps) {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.block, { backgroundColor: theme.surface, opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** A skeleton shaped like the full cafe list — shown while the first page loads. */
export function CafeListSkeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading cafes" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={styles.card}>
          <Skeleton style={styles.cardImage} />
          <Skeleton style={styles.line} />
          <Skeleton style={styles.lineShort} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Radius.md,
  },
  list: {
    gap: 20,
  },
  card: {
    gap: 8,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  line: {
    height: 16,
    width: '60%',
  },
  lineShort: {
    height: 14,
    width: '35%',
  },
});
