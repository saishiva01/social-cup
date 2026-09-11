import type { Drink, WeeklyHours } from '@social-cup/types';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { CafeImage } from '@/components/cafe-image';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StarRatingDisplay } from '@/components/star-rating';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';

const WEEKDAYS: { key: keyof WeeklyHours; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

/**
 * Cafe detail (PRD Module 4): photo gallery, name/neighbourhood/address,
 * hours with an open/closed indicator, vibe tags, full menu with retail +
 * credit price per drink, directions, and the Redeem button that opens the
 * drink picker into the redemption flow (PRD Module 8, apps/mobile/src/app/redeem/[drinkId].tsx).
 */
export default function CafeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getCafeDetail } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [redeemPickerOpen, setRedeemPickerOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['cafes', 'detail', id],
    queryFn: () => getCafeDetail(id),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      // A 404 (bad/removed id) will never succeed on retry.
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 1;
    },
  });

  if (detailQuery.isLoading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator size="large" color={theme.primary} />
      </ScreenContainer>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const isNotFound = detailQuery.error instanceof ApiError && detailQuery.error.status === 404;

    return (
      <ScreenContainer header center>
        <EmptyState
          icon={isNotFound ? 'alert-circle-outline' : 'cloud-offline-outline'}
          title={isNotFound ? 'This café is no longer available' : "Couldn't load this café"}
          subtitle={isNotFound ? undefined : 'Check your connection and try again.'}
          actionLabel={isNotFound ? undefined : 'Retry'}
          onAction={isNotFound ? undefined : () => void detailQuery.refetch()}
          testID="cafe-detail-error"
        />
      </ScreenContainer>
    );
  }

  const { cafe, drinks } = detailQuery.data;

  function openRating(drink: Drink) {
    setPickerOpen(false);
    router.push({
      pathname: '/rate/[drinkId]',
      params: { drinkId: drink.id, drinkName: drink.name, cafeName: cafe.name },
    });
  }

  function openRedemption(drink: Drink) {
    setRedeemPickerOpen(false);
    router.push({
      pathname: '/redeem/[drinkId]',
      params: {
        drinkId: drink.id,
        drinkName: drink.name,
        cafeId: cafe.id,
        cafeName: cafe.name,
        creditPrice: String(drink.creditPrice),
      },
    });
  }

  return (
    <ScreenContainer header center={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <PhotoGallery photos={cafe.photos} name={cafe.name} />

        <View style={styles.section}>
          <ThemedText type="subtitle">{cafe.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {cafe.neighborhood}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {cafe.address}
          </ThemedText>
          {cafe.isOpenNow !== null ? (
            <ThemedText
              type="smallBold"
              themeColor={cafe.isOpenNow ? 'success' : 'textMuted'}
              testID="cafe-open-indicator"
            >
              {cafe.isOpenNow ? 'Open now' : 'Closed now'}
            </ThemedText>
          ) : null}
          {cafe.perkLine ? (
            <ThemedText type="small" themeColor="textSecondary">
              {cafe.perkLine}
            </ThemedText>
          ) : null}
        </View>

        {cafe.vibeTags.length > 0 ? (
          <View style={styles.tagsRow}>
            {cafe.vibeTags.map((tag) => (
              <View key={tag} style={[styles.tag, { borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <View style={styles.actionButton}>
            <PrimaryButton
              label="Get directions"
              variant="secondary"
              onPress={() => void openDirections(cafe.address)}
            />
          </View>
          <View style={styles.actionButton}>
            <RedeemButton onReady={() => setRedeemPickerOpen(true)} />
          </View>
        </View>
        {drinks.length > 0 ? (
          <PrimaryButton
            label="Rate a drink"
            variant="secondary"
            onPress={() => setPickerOpen(true)}
            testID="cafe-rate-a-drink"
          />
        ) : null}

        <DrinkPickerModal
          visible={pickerOpen}
          drinks={drinks}
          onClose={() => setPickerOpen(false)}
          onSelect={openRating}
        />

        <DrinkPickerModal
          visible={redeemPickerOpen}
          drinks={drinks}
          onClose={() => setRedeemPickerOpen(false)}
          onSelect={openRedemption}
          rowTestID="redeem-picker-row"
        />

        <HoursTable hours={cafe.hours} />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionHeader}>
            MENU
          </ThemedText>
          {drinks.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              This café hasn&apos;t added its menu yet.
            </ThemedText>
          ) : (
            <View style={styles.menu}>
              {drinks.map((drink) => (
                <View key={drink.id} style={styles.drinkRow} testID="menu-drink-row">
                  <View style={styles.drinkImage}>
                    <CafeImage uri={drink.photoUrl} fallbackLabel={drink.name} />
                  </View>
                  <View style={styles.drinkInfo}>
                    <View style={styles.drinkNameRow}>
                      <ThemedText type="smallBold" style={styles.drinkName} numberOfLines={1}>
                        {drink.name}
                      </ThemedText>
                      {drink.signature ? (
                        <View style={styles.signatureBadge}>
                          <Ionicons name="sparkles" size={11} color={theme.primary} />
                          <ThemedText type="small" themeColor="primary">
                            Signature
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    {drink.description ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {drink.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" themeColor="primary">
                      {drink.creditPrice} {drink.creditPrice === 1 ? 'credit' : 'credits'} · $
                      {(drink.retailPriceCents / 100).toFixed(2)} retail
                    </ThemedText>
                    <View style={styles.drinkFooterRow}>
                      <StarRatingDisplay
                        averageRating={drink.averageRating}
                        ratingCount={drink.ratingCount}
                      />
                      <ThemedText
                        type="small"
                        themeColor="primary"
                        accessibilityRole="button"
                        onPress={() => openRating(drink)}
                        testID="menu-drink-rate"
                      >
                        Rate
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

/**
 * "Rate a drink" (PRD Module 4 actions row) opens this picker, then the
 * rating sheet (apps/mobile/src/app/rate/[drinkId].tsx) for whichever drink
 * is chosen — reuses the menu already fetched for this screen instead of a
 * separate network round trip.
 */
function DrinkPickerModal({
  visible,
  drinks,
  onClose,
  onSelect,
  rowTestID = 'drink-picker-row',
}: {
  visible: boolean;
  drinks: Drink[];
  onClose: () => void;
  onSelect: (drink: Drink) => void;
  /** Distinguishes this screen's two pickers (rate vs. redeem) in tests — RN's Modal keeps children mounted even while hidden. */
  rowTestID?: string;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.modalSheet, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={styles.modalTitle}>
            Which drink?
          </ThemedText>
          <ScrollView>
            {drinks.map((drink) => (
              <Pressable
                key={drink.id}
                accessibilityRole="button"
                onPress={() => onSelect(drink)}
                style={[styles.modalRow, { borderColor: theme.border }]}
                testID={rowTestID}
              >
                <View style={styles.modalRowImage}>
                  <CafeImage uri={drink.photoUrl} fallbackLabel={drink.name} />
                </View>
                <ThemedText type="default">{drink.name}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const GALLERY_STEP = 340 + Spacing.two;

function PhotoGallery({ photos, name }: { photos: string[]; name: string }) {
  const theme = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <View style={styles.galleryImage}>
        <CafeImage uri={null} fallbackLabel={name} />
      </View>
    );
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / GALLERY_STEP);
    setActiveIndex(Math.min(Math.max(index, 0), photos.length - 1));
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {photos.map((photo, index) => (
          <View key={`${photo}-${index}`} style={styles.galleryImage}>
            <CafeImage uri={photo} fallbackLabel={name} />
          </View>
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={styles.galleryDots} testID="gallery-dots">
          {photos.map((_, index) => (
            <View
              key={index}
              style={[
                styles.galleryDot,
                {
                  backgroundColor: index === activeIndex ? theme.primary : theme.border,
                  width: index === activeIndex ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HoursTable({ hours }: { hours: WeeklyHours }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionHeader}>
        HOURS
      </ThemedText>
      {WEEKDAYS.map(({ key, label }) => {
        const today = hours[key];
        return (
          <View key={key} style={styles.hoursRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {today ? `${formatTime(today.open)} – ${formatTime(today.close)}` : 'Closed'}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * ADR-0008's account-state-dependent Redeem behavior (PRD Module 4/8): a
 * Visitor is sent to the membership screen; a Member with zero credits or a
 * failed payment sees a disabled, explanatory button; a Member with credits
 * opens the drink picker, which hands off to redeem/[drinkId].tsx — the
 * server re-validates membership and credits independently when that screen
 * calls createRedemption, this is UX gating only.
 */
function RedeemButton({ onReady }: { onReady: () => void }) {
  const { getMembership } = useAuth();
  const router = useRouter();

  const membershipQuery = useQuery({
    queryKey: ['membership'],
    queryFn: () => getMembership(),
  });

  if (membershipQuery.isLoading || !membershipQuery.data) {
    return <PrimaryButton label="Redeem here" disabled onPress={() => {}} />;
  }

  const membership = membershipQuery.data;

  if (!membership.isMember) {
    return (
      <PrimaryButton
        label="Join Social Cup to redeem"
        onPress={() => router.push('/membership')}
        testID="redeem-join"
      />
    );
  }

  if (membership.credits <= 0) {
    return <PrimaryButton label="No credits left" disabled onPress={() => {}} />;
  }

  return <PrimaryButton label="Redeem here" onPress={onReady} testID="redeem-here" />;
}

function formatTime(value: string): string {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

async function openDirections(address: string): Promise<void> {
  const encoded = encodeURIComponent(address);
  const url =
    Platform.OS === 'ios' ? `http://maps.apple.com/?address=${encoded}` : `geo:0,0?q=${encoded}`;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  } else {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
  },
  galleryImage: {
    width: 340,
    height: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginRight: Spacing.two,
  },
  galleryDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: Spacing.two,
  },
  galleryDot: {
    height: 6,
    borderRadius: 3,
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  menu: {
    gap: Spacing.three,
  },
  drinkRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  drinkImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  drinkInfo: {
    flex: 1,
    gap: 2,
  },
  drinkNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  drinkName: {
    flexShrink: 1,
  },
  signatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  drinkFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: {
    marginBottom: Spacing.two,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  modalRowImage: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
});
