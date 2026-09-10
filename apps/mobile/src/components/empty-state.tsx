import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/**
 * The shared empty/error-state layout for discovery screens: a title, an
 * optional explanation of what happened, and an optional single action
 * (e.g. "Clear filters", "Retry") — never a bare "Something went wrong."
 */
export function EmptyState({ title, subtitle, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      <ThemedText type="smallBold" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
});
