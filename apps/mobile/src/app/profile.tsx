import { COFFEE_PREFERENCES, type CoffeePreference } from '@social-cup/types';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

/**
 * Profile setup (PRD Module 2): display name, optional photo URL, coffee
 * preferences (the four PRD values), and home neighbourhood. Email is
 * read-only here. Membership/verification state is never editable client-side.
 */
export default function ProfileScreen() {
  const { user, updateProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user?.profilePhotoUrl ?? '');
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood ?? '');
  const [coffeePreferences, setCoffeePreferences] = useState<CoffeePreference[]>(
    user?.coffeePreferences ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function togglePreference(preference: CoffeePreference) {
    setSaved(false);
    setCoffeePreferences((current) =>
      current.includes(preference)
        ? current.filter((item) => item !== preference)
        : [...current, preference],
    );
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        profilePhotoUrl: profilePhotoUrl.trim() === '' ? null : profilePhotoUrl.trim(),
        coffeePreferences,
        neighborhood: neighborhood.trim() === '' ? null : neighborhood.trim(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Profile</ThemedText>

          <FormField
            label="Display name"
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              setSaved(false);
            }}
            autoComplete="name"
            textContentType="name"
            testID="profile-name"
          />
          <FormField
            label="Email (sign-in)"
            value={user?.email ?? ''}
            editable={false}
            testID="profile-email"
          />
          <FormField
            label="Profile photo URL (optional)"
            value={profilePhotoUrl}
            onChangeText={(value) => {
              setProfilePhotoUrl(value);
              setSaved(false);
            }}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://…"
            testID="profile-photo"
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fieldLabel}>
            Coffee preferences
          </ThemedText>
          <View style={styles.chips}>
            {COFFEE_PREFERENCES.map((preference) => {
              const selected = coffeePreferences.includes(preference);
              return (
                <Pressable
                  key={preference}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => togglePreference(preference)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  testID={`pref-${preference}`}
                >
                  <ThemedText type="small">{preferenceLabel(preference)}</ThemedText>
                </Pressable>
              );
            })}
          </View>

          <FormField
            label="Home neighbourhood"
            value={neighborhood}
            onChangeText={(value) => {
              setNeighborhood(value);
              setSaved(false);
            }}
            placeholder="e.g. Bishop Arts District"
            testID="profile-neighborhood"
          />

          {error ? (
            <ThemedText type="small" style={styles.error} testID="profile-error">
              {error}
            </ThemedText>
          ) : null}
          {saved ? (
            <ThemedText type="small" style={styles.success} testID="profile-saved">
              Profile saved.
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Save profile"
            busy={busy}
            onPress={handleSave}
            testID="profile-save"
          />

          <PrimaryButton
            label="Sign out"
            busy={false}
            onPress={() => void logout()}
            style={styles.logoutButton}
            testID="profile-logout"
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            <Link href="/">Back to home</Link>
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function preferenceLabel(preference: CoffeePreference): string {
  switch (preference) {
    case 'cold_brew':
      return 'Cold brew';
    default:
      return preference[0].toUpperCase() + preference.slice(1);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  fieldLabel: {
    marginTop: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chipSelected: {
    backgroundColor: '#208AEF',
    borderColor: '#208AEF',
  },
  error: {
    color: '#D93025',
    marginBottom: Spacing.two,
  },
  success: {
    color: '#188038',
    marginBottom: Spacing.two,
  },
  logoutButton: {
    backgroundColor: '#D93025',
    marginTop: Spacing.two,
  },
  centered: {
    textAlign: 'center',
    marginTop: Spacing.three,
  },
});
