import type { CafeListItem } from '@social-cup/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { CafeImage } from '@/components/cafe-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

interface FeaturedCafeCardProps {
  cafe: CafeListItem;
  onPress: () => void;
}

const CARD_WIDTH = 200;

/** Compact, photo-forward card for the "New on Social Cup" curated strip (PRD Module 6). */
export function FeaturedCafeCard({ cafe, onPress }: FeaturedCafeCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cafe.name}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.imageWrapper}>
        <CafeImage uri={cafe.coverPhotoUrl} fallbackLabel={cafe.name} />
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {cafe.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {cafe.neighborhood}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    gap: 4,
  },
  pressed: {
    opacity: 0.9,
  },
  imageWrapper: {
    width: CARD_WIDTH,
    height: 130,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.half,
  },
});
