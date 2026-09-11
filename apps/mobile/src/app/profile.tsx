import { COFFEE_PREFERENCES, type CoffeePreference } from '@social-cup/types';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Profile setup (PRD Module 2): display name, optional photo URL, coffee
 * preferences (the four PRD values), and home neighbourhood. Email is
 * read-only here. Membership/verification state is never editable client-side.
 */
export default function ProfileScreen() {
  const { status, user, updateProfile, logout } = useAuth();
  const router = useRouter();
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

  function markDirty<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setSaved(false);
    };
  }

  async function handleSave() {
    if (busy) return;
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

  // Reachable only from an authenticated session; a signed-out visitor
  // (e.g. a stale deep link, or opening this route directly) is sent to
  // sign in instead of seeing an empty form.
  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenContainer center={false} header title="Your profile">
      <SectionHeader title="Account" first />
      <FormField label="Email" value={user?.email ?? ''} editable={false} testID="profile-email" />
      {user && !user.emailVerified ? (
        <StatusMessage variant="error">Your email address is not verified yet.</StatusMessage>
      ) : null}

      <SectionHeader title="Profile" />
      <FormField
        label="Display name"
        value={displayName}
        onChangeText={markDirty(setDisplayName)}
        autoComplete="name"
        textContentType="name"
        testID="profile-name"
      />
      <FormField
        label="Profile photo URL (optional)"
        value={profilePhotoUrl}
        onChangeText={markDirty(setProfilePhotoUrl)}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://…"
        helperText="Paste a link to a photo — uploading one directly is coming soon."
        testID="profile-photo"
      />

      <SectionHeader title="Preferences" />
      <View style={styles.field}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Coffee preferences
        </ThemedText>
        <View style={styles.chips}>
          {COFFEE_PREFERENCES.map((preference) => (
            <PreferenceChip
              key={preference}
              preference={preference}
              selected={coffeePreferences.includes(preference)}
              onToggle={() => togglePreference(preference)}
            />
          ))}
        </View>
      </View>
      <FormField
        label="Home neighbourhood"
        value={neighborhood}
        onChangeText={markDirty(setNeighborhood)}
        placeholder="e.g. Bishop Arts District"
        testID="profile-neighborhood"
      />

      {error ? (
        <StatusMessage variant="error" testID="profile-error">
          {error}
        </StatusMessage>
      ) : null}
      {saved ? (
        <StatusMessage variant="success" testID="profile-saved">
          Profile saved.
        </StatusMessage>
      ) : null}

      <PrimaryButton label="Save profile" busy={busy} onPress={handleSave} testID="profile-save" />

      <SectionHeader title="Membership" />
      <PrimaryButton
        label="Manage membership"
        variant="secondary"
        onPress={() => router.push('/membership')}
        testID="profile-membership"
      />

      <SectionHeader title="Activity" />
      <PrimaryButton
        label="My drink diary"
        variant="secondary"
        onPress={() => router.push('/diary')}
        testID="profile-diary"
      />

      <SectionHeader title="Account actions" />
      <PrimaryButton
        label="Sign out"
        variant="danger"
        onPress={() => void logout()}
        testID="profile-logout"
      />
    </ScreenContainer>
  );
}

function SectionHeader({ title, first = false }: { title: string; first?: boolean }) {
  const theme = useTheme();
  return (
    <ThemedText
      type="smallBold"
      themeColor="textMuted"
      style={[styles.sectionHeader, !first && { borderTopColor: theme.border, borderTopWidth: 1 }]}
    >
      {title.toUpperCase()}
    </ThemedText>
  );
}

function PreferenceChip({
  preference,
  selected,
  onToggle,
}: {
  preference: CoffeePreference;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onToggle}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primary : 'transparent',
        },
      ]}
      testID={`pref-${preference}`}
    >
      <ThemedText type="small" style={{ color: selected ? theme.primaryText : theme.text }}>
        {preferenceLabel(preference)}
      </ThemedText>
    </Pressable>
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
  sectionHeader: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    letterSpacing: 0.8,
  },
  field: {
    gap: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
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
