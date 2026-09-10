import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';
import { StripeProvider } from '@stripe/stripe-react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider } from '@/contexts/auth-context';
import { queryClient } from '@/lib/queryClient';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/stripe-config';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Pacifico_400Regular, Lora_400Regular, Lora_700Bold });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StripeProvider
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier="merchant.com.socialcup.app"
        urlScheme="socialcup"
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </QueryClientProvider>
      </StripeProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
