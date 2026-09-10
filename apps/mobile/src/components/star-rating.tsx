import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface StarRatingDisplayProps {
  averageRating: number | null;
  ratingCount: number;
  testID?: string;
}

/** Read-only average + count, or a "New" badge when nothing's been rated yet (PRD Module 3/4/5). */
export function StarRatingDisplay({ averageRating, ratingCount, testID }: StarRatingDisplayProps) {
  if (averageRating === null) {
    return (
      <ThemedText type="small" themeColor="textSecondary" testID={testID}>
        New
      </ThemedText>
    );
  }

  return (
    <ThemedText type="small" themeColor="textSecondary" testID={testID}>
      {'★'} {averageRating.toFixed(1)} ({ratingCount})
    </ThemedText>
  );
}

interface StarRatingInputProps {
  value: number;
  onChange: (stars: number) => void;
  testID?: string;
}

/** Interactive 1-5 star picker (PRD Module 5) — tap a star to set that value. */
export function StarRatingInput({ value, onChange, testID }: StarRatingInputProps) {
  const theme = useTheme();

  return (
    <View style={styles.row} testID={testID}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
          accessibilityState={{ selected: value === star }}
          hitSlop={6}
          onPress={() => onChange(star)}
          testID={`star-${star}`}
        >
          <ThemedText
            style={[styles.star, { color: star <= value ? theme.primary : theme.border }]}
          >
            {'★'}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  star: {
    fontSize: 32,
  },
});
