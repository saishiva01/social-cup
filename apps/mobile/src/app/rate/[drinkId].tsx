import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StarRatingInput } from '@/components/star-rating';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Rate a drink (PRD Module 5): 1-5 stars, an optional note up to 140
 * characters, or skip entirely by leaving the screen. One rating per member
 * per drink, editable at any time — this same screen creates a first rating
 * or edits an existing one, depending on whether GET /drinks/:id/rating
 * already returned one. Reachable any time from the cafe page, not only
 * after a redemption (redemption doesn't exist yet — Phase 5).
 */
export default function RateDrinkScreen() {
  const { drinkId, drinkName, cafeName } = useLocalSearchParams<{
    drinkId: string;
    drinkName?: string;
    cafeName?: string;
  }>();
  const { getMyRating, rateDrink } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();

  const existingQuery = useQuery({
    queryKey: ['ratings', 'mine', drinkId],
    queryFn: () => getMyRating(drinkId),
    enabled: Boolean(drinkId),
  });

  // Local edits take priority over the fetched rating, which arrives async;
  // deriving the displayed value at render time (rather than seeding local
  // state from an effect once the query resolves) avoids a redundant render
  // pass every time the query settles.
  const [starsOverride, setStarsOverride] = useState<number | null>(null);
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const stars = starsOverride ?? existingQuery.data?.stars ?? 0;
  const note = noteOverride ?? existingQuery.data?.note ?? '';

  async function handleSubmit() {
    if (busy || stars === 0) return;
    setBusy(true);
    setError(null);
    try {
      await rateDrink(drinkId, { stars, note: note.trim() === '' ? null : note.trim() });
      // Ratings feed the diary and the drink/cafe aggregates shown on
      // discovery and detail — all three need to reflect this write.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ratings'] }),
        queryClient.invalidateQueries({ queryKey: ['cafes'] }),
        queryClient.invalidateQueries({ queryKey: ['drinks'] }),
      ]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating.');
    } finally {
      setBusy(false);
    }
  }

  if (existingQuery.isLoading) {
    return (
      <ScreenContainer header center>
        <ActivityIndicator size="large" color={theme.primary} />
      </ScreenContainer>
    );
  }

  if (saved) {
    return (
      <ScreenContainer header center>
        <ThemedText type="subtitle" style={styles.centered}>
          Rating saved
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Thanks for rating {drinkName ?? 'this drink'}.
        </ThemedText>
        <View style={styles.doneActions}>
          <PrimaryButton label="Back to café" onPress={() => router.back()} testID="rate-back" />
          <PrimaryButton
            label="View my diary"
            variant="secondary"
            onPress={() => router.push('/diary')}
            testID="rate-view-diary"
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">
        {existingQuery.data ? 'Edit your rating' : 'Rate this drink'}
      </ThemedText>

      <View style={styles.context}>
        <ThemedText type="smallBold">{drinkName ?? 'This drink'}</ThemedText>
        {cafeName ? (
          <ThemedText type="small" themeColor="textSecondary">
            {cafeName}
          </ThemedText>
        ) : null}
      </View>

      <StarRatingInput value={stars} onChange={setStarsOverride} testID="rate-stars" />

      <FormField
        label="Note (optional)"
        value={note}
        onChangeText={setNoteOverride}
        placeholder="What did you think?"
        maxLength={140}
        multiline
        testID="rate-note"
      />

      {error ? (
        <StatusMessage variant="error" testID="rate-error">
          {error}
        </StatusMessage>
      ) : null}

      <PrimaryButton
        label={existingQuery.data ? 'Update rating' : 'Submit rating'}
        busy={busy}
        disabled={stars === 0}
        onPress={handleSubmit}
        testID="rate-submit"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  context: {
    gap: 2,
  },
  centered: {
    textAlign: 'center',
  },
  doneActions: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
});
