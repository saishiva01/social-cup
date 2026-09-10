import type { CafeListItem } from '@social-cup/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { CafeImage } from '@/components/cafe-image';
import { StarRatingDisplay } from '@/components/star-rating';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CafeCardProps {
  cafe: CafeListItem;
  onPress: () => void;
}

/**
 * The full-width card for the main cafe list (PRD Module 3.2): cover photo,
 * name, neighbourhood, distance, vibe tags, lowest credit price, and a
 * rating or "New" badge. Kept to the information the PRD specifies — enough
 * to decide "is this worth opening?" without overloading the card.
 */
export function CafeCard({ cafe, onPress }: CafeCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cafe.name}, ${cafe.neighborhood}`}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      testID="cafe-card"
    >
      <View style={styles.imageWrapper}>
        <CafeImage uri={cafe.coverPhotoUrl} fallbackLabel={cafe.name} />
        <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
          <StarRatingDisplay averageRating={cafe.averageRating} ratingCount={cafe.ratingCount} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
            {cafe.name}
          </ThemedText>
          {cafe.distanceMiles !== null ? (
            <ThemedText type="small" themeColor="textMuted">
              {formatDistance(cafe.distanceMiles)}
            </ThemedText>
          ) : null}
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          {cafe.neighborhood}
        </ThemedText>

        {cafe.vibeTags.length > 0 ? (
          <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
            {cafe.vibeTags.join(' · ')}
          </ThemedText>
        ) : null}

        {cafe.lowestCreditPrice !== null ? (
          <ThemedText type="small" themeColor="primary">
            Drinks from {cafe.lowestCreditPrice}{' '}
            {cafe.lowestCreditPrice === 1 ? 'credit' : 'credits'}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(1)} mi`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.9,
  },
  imageWrapper: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  body: {
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
});
