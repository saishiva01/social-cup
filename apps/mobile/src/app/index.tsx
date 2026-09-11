import type { CafeListItem } from '@social-cup/types';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CafeCard } from '@/components/cafe-card';
import { EmptyState } from '@/components/empty-state';
import { FeaturedCafeCard } from '@/components/featured-cafe-card';
import { HorizontalStrip } from '@/components/horizontal-strip';
import { NeighborhoodFilterChips } from '@/components/neighborhood-filter-chips';
import { PrimaryButton } from '@/components/primary-button';
import { SearchInput } from '@/components/search-input';
import { SignatureDrinkCard } from '@/components/signature-drink-card';
import { CafeListSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useLocationPermission } from '@/hooks/use-location-permission';
import { useTheme } from '@/hooks/use-theme';

/** Native pixel dimensions of assets/images/hero-cheers.jpg (1200x800) — the hero View is sized to this ratio so the full photo shows with no crop and no letterboxing. */
const HERO_IMAGE_RATIO = 1200 / 800;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Home. Auth-state routing lives here: while the session is being restored
 * we show a spinner; unauthenticated users see the marketing welcome screen
 * (browsing/rating is free per ADR-0008 — subscribing is a choice made later,
 * not a gate to entry); authenticated users (Visitor or Member — the server
 * owns entitlement) see cafe discovery (PRD Module 3).
 */
export default function HomeScreen() {
  const { status, user } = useAuth();
  const theme = useTheme();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  if (status === 'unauthenticated') {
    return <WelcomeScreen />;
  }

  return <DiscoverScreen displayName={user?.displayName ?? 'there'} />;
}

function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.hero}>
        <Image
          source={require('../../assets/images/hero-cheers.jpg')}
          style={styles.heroImage}
          resizeMode="contain"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.45)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroCaption}>
          <ThemedText type="script" style={styles.logo}>
            Social Cup
          </ThemedText>
          <ThemedText type="small" style={styles.heroSubtitle}>
            Good coffee. Good company.
          </ThemedText>
        </View>
      </View>

      <SafeAreaView
        style={[styles.bottomSafeArea, { backgroundColor: theme.background }]}
        edges={['bottom']}
      >
        <View style={[styles.panel, { backgroundColor: theme.background }]}>
          <View style={styles.content}>
            <ThemedText type="title" style={styles.title}>
              Welcome to Social Cup
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
              A Dallas coffee membership — one card, every partner café.
            </ThemedText>

            <View style={styles.spacer} />

              <PrimaryButton
              label="Get started"
              onPress={() => router.push('/register')}
              testID="welcome-get-started"
            />
            <PrimaryButton
              label="I already have an account"
              variant="secondary"
              onPress={() => router.push('/login')}
              testID="welcome-login"
            />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Cafe discovery (PRD Module 3) — the first screen a signed-in user sees.
 * Search + neighbourhood filter at top, curated/signature strips (Module 6),
 * then the full paginated cafe list, nearest-first when location is on.
 */
function DiscoverScreen({ displayName }: { displayName: string }) {
  const { getCafes, getFeaturedCafes, getSignatureDrinks, getNeighborhoods } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const location = useLocationPermission();
  const coords = useCurrentLocation(location.state === 'granted');

  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const neighborhoodsQuery = useQuery({
    queryKey: ['cafes', 'neighborhoods'],
    queryFn: () => getNeighborhoods(),
  });

  const featuredQuery = useQuery({
    queryKey: ['cafes', 'featured', coords?.latitude, coords?.longitude],
    queryFn: () => getFeaturedCafes({ lat: coords?.latitude, lng: coords?.longitude }),
  });

  const signatureQuery = useQuery({
    queryKey: ['drinks', 'signature'],
    queryFn: () => getSignatureDrinks(),
  });

  const cafesQuery = useInfiniteQuery({
    queryKey: [
      'cafes',
      'list',
      debouncedSearch,
      selectedNeighborhood,
      coords?.latitude,
      coords?.longitude,
    ],
    queryFn: ({ pageParam }) =>
      getCafes({
        search: debouncedSearch || undefined,
        neighborhood: selectedNeighborhood ?? undefined,
        lat: coords?.latitude,
        lng: coords?.longitude,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

  const cafes = cafesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasActiveFilters = debouncedSearch.length > 0 || selectedNeighborhood !== null;

  function clearFilters() {
    setSearchText('');
    setSelectedNeighborhood(null);
  }

  function openCafe(cafe: CafeListItem) {
    router.push(`/cafe/${cafe.id}`);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <FlatList
          data={cafes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CafeCard cafe={item} onPress={() => openCafe(item)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (cafesQuery.hasNextPage && !cafesQuery.isFetchingNextPage) {
              void cafesQuery.fetchNextPage();
            }
          }}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <ThemedText type="subtitle">Discover</ThemedText>
                <Link href="/profile" asChild>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.profileLink}
                    testID="discover-profile-link"
                  >
                    <Ionicons name="person-circle-outline" size={18} color={theme.primary} />
                    <ThemedText type="smallBold" themeColor="primary">
                      Profile
                    </ThemedText>
                  </Pressable>
                </Link>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Hi {displayName} — here&apos;s what&apos;s brewing nearby.
              </ThemedText>

              <LocationCard state={location.state} onRequest={location.requestPermission} />

              <SearchInput
                value={searchText}
                onChangeText={setSearchText}
                testID="discover-search"
              />

              <NeighborhoodFilterChips
                neighborhoods={neighborhoodsQuery.data ?? []}
                selected={selectedNeighborhood}
                onSelect={setSelectedNeighborhood}
              />

              {!hasActiveFilters && featuredQuery.data && featuredQuery.data.length > 0 ? (
                <HorizontalStrip title="New on Social Cup">
                  {featuredQuery.data.map((cafe) => (
                    <FeaturedCafeCard key={cafe.id} cafe={cafe} onPress={() => openCafe(cafe)} />
                  ))}
                </HorizontalStrip>
              ) : null}

              {!hasActiveFilters && signatureQuery.data && signatureQuery.data.length > 0 ? (
                <HorizontalStrip title="Signature drinks">
                  {signatureQuery.data.map((drink) => (
                    <SignatureDrinkCard
                      key={drink.id}
                      drink={drink}
                      onPress={() => router.push(`/cafe/${drink.cafeId}`)}
                    />
                  ))}
                </HorizontalStrip>
              ) : null}

              <ThemedText
                type="smallBold"
                themeColor="textMuted"
                style={[styles.sectionHeader, { borderTopColor: theme.border }]}
              >
                ALL CAFÉS
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            cafesQuery.isLoading ? (
              <CafeListSkeleton />
            ) : cafesQuery.isError ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load cafés"
                subtitle="Check your connection and try again."
                actionLabel="Retry"
                onAction={() => void cafesQuery.refetch()}
                testID="discover-error"
              />
            ) : hasActiveFilters ? (
              <EmptyState
                icon="search-outline"
                title="No cafés match your search"
                subtitle="Try a different name or neighbourhood."
                actionLabel="Clear filters"
                onAction={clearFilters}
                testID="discover-empty"
              />
            ) : (
              <EmptyState
                icon="cafe-outline"
                title="No cafés yet"
                subtitle="New partner cafés are added regularly — check back soon."
                testID="discover-empty"
              />
            )
          }
          ListFooterComponent={
            cafesQuery.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerSpinner} color={theme.primary} />
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

interface LocationCardProps {
  state: ReturnType<typeof useLocationPermission>['state'];
  onRequest: () => Promise<void>;
}

/**
 * Explains and requests location once (PRD Module 2), used to sort cafes by
 * distance. We never read or store precise location here — see
 * src/hooks/use-location-permission.ts and use-current-location.ts. Declined
 * → distance sorting turns off and neighbourhood/name orders the list
 * instead (PRD Module 3).
 */
function LocationCard({ state, onRequest }: LocationCardProps) {
  const theme = useTheme();

  if (state === 'granted') {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText type="small">Location on — cafés will be sorted nearest first.</ThemedText>
      </View>
    );
  }

  if (state === 'denied') {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Location is off, so we&apos;ll order cafés by neighbourhood instead. You can change this
          any time in your device settings.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <ThemedText type="smallBold">Find cafés near you</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Allow location once so we can sort cafés by distance. You can turn it off later.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void onRequest()}
        style={[styles.cardButton, { backgroundColor: theme.primary }]}
      >
        <ThemedText type="smallBold" themeColor="primaryText">
          Allow location
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.four,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MinTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  sectionHeader: {
    letterSpacing: 0.5,
    marginTop: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  separator: {
    height: Spacing.four,
  },
  footerSpinner: {
    marginVertical: Spacing.four,
  },
  card: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardButton: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  hero: {
    width: '100%',
    aspectRatio: HERO_IMAGE_RATIO,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  heroCaption: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  logo: {
    color: '#FFFFFF',
  },
  heroSubtitle: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bottomSafeArea: {
    flex: 1,
  },
  panel: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  spacer: {
    flex: 1,
    minHeight: Spacing.three,
  },
});
