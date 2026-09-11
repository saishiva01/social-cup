import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SearchInputProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
}

/** Cafe-name search (PRD Module 3) — filters as the person types, clearable in one tap. */
export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search cafés by name',
  testID,
}: SearchInputProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { color: theme.text }]}
        accessibilityLabel="Search cafés"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        testID={testID}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={styles.clearButton}
        >
          <Ionicons name="close-circle" size={18} color={theme.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  searchIcon: {
    opacity: 0.9,
  },
  input: {
    flex: 1,
    minHeight: MinTouchTarget,
    fontSize: 16,
  },
  clearButton: {
    width: MinTouchTarget - 12,
    height: MinTouchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
