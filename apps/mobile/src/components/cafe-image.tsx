import { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CafeImageProps {
  uri: string | null;
  /** First letter shown as a placeholder when there's no photo or it fails to load. */
  fallbackLabel: string;
  style?: StyleProp<ImageStyle>;
}

/**
 * The one place a cafe/drink photo URL is rendered. A missing photo or a
 * failed load never breaks the surrounding screen — it falls back to a
 * plain initial on a neutral surface, matching the app's calm/editorial
 * visual direction rather than a broken-image icon.
 */
export function CafeImage({ uri, fallbackLabel, style }: CafeImageProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.surface }, style]}>
        <ThemedText type="title" themeColor="textMuted" style={styles.fallbackLabel}>
          {fallbackLabel.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md,
  },
  fallback: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackLabel: {
    fontSize: 28,
  },
});
