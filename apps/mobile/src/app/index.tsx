import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useLocationPermission } from '@/hooks/use-location-permission';

/**
 * Home. Auth-state routing lives here: while the session is being restored
 * we show a spinner; unauthenticated users are sent to sign-in; authenticated
 * users (Visitor or Member — the server owns entitlement, ADR-0008) see the
 * home content.
 */
export default function HomeScreen() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  return <SignedInHome displayName={user?.displayName ?? 'there'} />;
}

function SignedInHome({ displayName }: { displayName: string }) {
  const location = useLocationPermission();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Social Cup
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            Hi {displayName} — Dallas coffee is a few taps away.
          </ThemedText>

          <LocationCard state={location.state} onRequest={location.requestPermission} />

          <Link href="/profile" asChild>
            <Pressable accessibilityRole="button" style={styles.profileLink}>
              <ThemedText type="smallBold">View profile</ThemedText>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

interface LocationCardProps {
  state: ReturnType<typeof useLocationPermission>['state'];
  onRequest: () => Promise<void>;
}

/**
 * Phase 1 foundation only: explain and request location once, used (later) to
 * sort cafes by distance. We never read or store precise location here — see
 * src/hooks/use-location-permission.ts. Declined → distance sorting turns off
 * and the saved neighbourhood orders the list instead (PRD Module 2).
 */
function LocationCard({ state, onRequest }: LocationCardProps) {
  if (state === 'granted') {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">Location on — cafes will be sorted nearest first.</ThemedText>
      </ThemedView>
    );
  }

  if (state === 'denied') {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">
          Location is off, so we&apos;ll order cafés by your saved neighbourhood instead. You can
          change this any time in your device settings.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Find cafés near you</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
        Allow location once so we can sort cafés by distance. You can turn it off later.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void onRequest()}
        style={styles.cardButton}
      >
        <ThemedText type="smallBold">Allow location</ThemedText>
      </Pressable>
    </ThemedView>
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
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  profileLink: {
    borderWidth: 1,
    borderColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardBody: {
    marginBottom: Spacing.one,
  },
  cardButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
});
