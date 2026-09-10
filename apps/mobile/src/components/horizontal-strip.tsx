import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface HorizontalStripProps {
  title: string;
  children: ReactNode;
}

/** Shared horizontally-scrolling strip shell for the curated/signature sections (PRD Module 6). */
export function HorizontalStrip({ title, children }: HorizontalStripProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" style={styles.title}>
        {title}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  title: {
    paddingHorizontal: 2,
  },
  row: {
    gap: Spacing.three,
    paddingRight: Spacing.two,
  },
});
