import { Ionicons } from '@expo/vector-icons';
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
  const theme = useTheme();

  if (averageRating === null) {
    return (
      <ThemedText type="smallBold" themeColor="primary" testID={testID}>
        New
      </ThemedText>
    );
  }

  return (
    <View style={styles.displayRow} testID={testID}>
      <Ionicons name="star" size={13} color={theme.primary} />
      <ThemedText type="smallBold" themeColor="text">
        {averageRating.toFixed(1)} ({ratingCount})
      </ThemedText>
    </View>
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
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={34}
            color={star <= value ? theme.primary : theme.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
