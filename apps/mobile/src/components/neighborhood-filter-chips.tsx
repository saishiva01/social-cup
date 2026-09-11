import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface NeighborhoodFilterChipsProps {
  neighborhoods: string[];
  selected: string | null;
  onSelect: (neighborhood: string | null) => void;
}

/**
 * The one PRD Module 3 filter (neighbourhood), single-select. Options come
 * from what's actually in the data (GET /cafes/neighborhoods) rather than a
 * guessed static list — see docs/decisions/open-questions.md #4a.
 */
export function NeighborhoodFilterChips({
  neighborhoods,
  selected,
  onSelect,
}: NeighborhoodFilterChipsProps) {
  if (neighborhoods.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Chip label="All neighborhoods" selected={selected === null} onPress={() => onSelect(null)} />
      {neighborhoods.map((neighborhood) => (
        <Chip
          key={neighborhood}
          label={neighborhood}
          selected={selected === neighborhood}
          onPress={() => onSelect(selected === neighborhood ? null : neighborhood)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
        },
      ]}
    >
      <ThemedText
        type="small"
        style={{ color: selected ? theme.primaryText : theme.text, fontWeight: selected ? '700' : '500' }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 36,
    justifyContent: 'center',
  },
});
