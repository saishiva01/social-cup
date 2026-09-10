import type { SignatureDrinkListItem } from '@social-cup/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { CafeImage } from '@/components/cafe-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

interface SignatureDrinkCardProps {
  drink: SignatureDrinkListItem;
  onPress: () => void;
}

const CARD_WIDTH = 150;

/** Signature-drink strip card (PRD Module 6) — taps through to that drink's cafe. */
export function SignatureDrinkCard({ drink, onPress }: SignatureDrinkCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${drink.name} at ${drink.cafeName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.imageWrapper}>
        <CafeImage uri={drink.photoUrl} fallbackLabel={drink.name} />
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {drink.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {drink.cafeName}
      </ThemedText>
      <ThemedText type="small" themeColor="primary">
        {drink.creditPrice} {drink.creditPrice === 1 ? 'credit' : 'credits'}
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
    height: CARD_WIDTH,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.half,
  },
});
