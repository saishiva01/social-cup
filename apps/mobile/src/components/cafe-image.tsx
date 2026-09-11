import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CardImage } from '@/constants/theme';
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
 * quiet branded placeholder (initial + cup mark on a tinted surface) rather
 * than a broken-image icon, and a real photo fades in once decoded instead
 * of popping in abruptly.
 */
export function CafeImage({ uri, fallbackLabel, style }: CafeImageProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.surface }, style]}>
        <ThemedText type="title" themeColor="textMuted" style={styles.fallbackLabel}>
          {fallbackLabel.charAt(0).toUpperCase()}
        </ThemedText>
        <Ionicons name="cafe-outline" size={18} color={theme.textMuted} style={styles.fallbackIcon} />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.image, { opacity }, style]}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed(true)}
        onLoad={() => {
          Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
        }}
        accessible={false}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    borderRadius: CardImage.radius,
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    height: '100%',
    borderRadius: CardImage.radius,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fallbackLabel: {
    fontSize: 28,
  },
  fallbackIcon: {
    opacity: 0.8,
  },
});
