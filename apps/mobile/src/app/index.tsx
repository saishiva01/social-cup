import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Social Cup
        </ThemedText>
        <ThemedText type="default" themeColor="text" style={styles.body}>
          Engineering foundation placeholder. Onboarding, discovery, ratings, membership, and
          redemption (PRD Modules 2–8) are built in a later phase — see
          docs/development/phases.md.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
});
