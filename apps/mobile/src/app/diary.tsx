import type { DiaryEntry } from '@social-cup/types';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { CafeImage } from '@/components/cafe-image';
import { EmptyState } from '@/components/empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

const THUMBNAIL_SIZE = 56;

const PAGE_SIZE = 20;

/**
 * Drink diary (PRD Module 5): every drink the member has rated, highest
 * rated first, showing drink, cafe, stars, note, and date. A rating IS a
 * diary entry — this screen is a read-only list over GET /me/ratings, not a
 * separate feature; it never shows another user's data (server-scoped to
 * the caller).
 */
export default function DiaryScreen() {
  const { status, getDiary } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const diaryQuery = useInfiniteQuery({
    queryKey: ['ratings', 'diary'],
    queryFn: ({ pageParam }) => getDiary({ page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: status === 'authenticated',
  });

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  const entries = diaryQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function openRating(entry: DiaryEntry) {
    router.push({
      pathname: '/rate/[drinkId]',
      params: { drinkId: entry.drink.id, drinkName: entry.drink.name, cafeName: entry.cafe.name },
    });
  }

  return (
    <ScreenContainer center={false} header title="Your drink diary">
      <FlatList
        data={entries}
        keyExtractor={(item) => item.ratingId}
        renderItem={({ item }) => <DiaryRow entry={item} onPress={() => openRating(item)} />}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { borderColor: theme.border }]} />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (diaryQuery.hasNextPage && !diaryQuery.isFetchingNextPage) {
            void diaryQuery.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          diaryQuery.isLoading ? (
            <ActivityIndicator size="large" color={theme.primary} testID="diary-loading" />
          ) : diaryQuery.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load your diary"
              subtitle="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void diaryQuery.refetch()}
              testID="diary-error"
            />
          ) : (
            <EmptyState
              icon="book-outline"
              title="No rated drinks yet"
              subtitle="Rate a drink from any café page to start your diary."
              testID="diary-empty"
            />
          )
        }
        ListFooterComponent={
          diaryQuery.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footerSpinner} color={theme.primary} />
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </ScreenContainer>
  );
}

function DiaryRow({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.row} testID="diary-row">
      <View style={styles.thumbnail}>
        <CafeImage uri={entry.drink.photoUrl} fallbackLabel={entry.drink.name} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold" style={styles.drinkName} numberOfLines={1}>
            {entry.drink.name}
          </ThemedText>
          <View style={styles.stars} accessibilityLabel={`${entry.stars} stars`} testID="diary-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= entry.stars ? 'star' : 'star-outline'}
                size={12}
                color={star <= entry.stars ? theme.primary : theme.border}
              />
            ))}
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {entry.cafe.name} · {entry.cafe.neighborhood}
        </ThemedText>
        {entry.note ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            &ldquo;{entry.note}&rdquo;
          </ThemedText>
        ) : null}
        <View style={styles.rowFooter}>
          <ThemedText type="small" themeColor="textMuted">
            {formatDate(entry.createdAt)}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="primary"
            accessibilityRole="button"
            onPress={onPress}
            testID="diary-edit"
          >
            Edit rating
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  drinkName: {
    flexShrink: 1,
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2,
  },
  separator: {
    borderBottomWidth: 1,
  },
  footerSpinner: {
    marginVertical: Spacing.four,
  },
});
