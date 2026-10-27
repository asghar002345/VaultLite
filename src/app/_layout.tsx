import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

import { loadSettings } from '@/store/settings';

import { Colors, Fonts } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SessionProvider, useSession } from '@/vault/session';
import { WalletConnectHost } from '@/walletconnect/provider';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2 } } });

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    loadSettings().finally(() => setSettingsLoaded(true));
  }, []);
  const ready = settingsLoaded && status !== 'loading' && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <>
    {status === 'unlocked' && <WalletConnectHost />}
    <Stack
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: Fonts.display },
        animation: 'fade_from_bottom',
      }}>
      <Stack.Protected guard={status === 'empty'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="lock" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unlocked'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="token/[chain]/[address]" options={{ headerShown: true, title: 'Token' }} />
        <Stack.Screen name="escrow/create" options={{ headerShown: true, title: 'New escrow' }} />
        <Stack.Screen name="escrow/[id]" options={{ headerShown: true, title: 'Escrow' }} />
        <Stack.Screen name="escrow/withdraw" options={{ headerShown: true, title: 'Withdraw' }} />
        <Stack.Screen name="receive" options={{ headerShown: true, title: 'Receive' }} />
        <Stack.Screen name="send/index" options={{ headerShown: true, title: 'Send' }} />
        <Stack.Screen name="send/review" options={{ headerShown: true, title: 'Review' }} />
        <Stack.Screen name="send/status/[hash]" options={{ headerShown: true, title: 'Status', headerBackVisible: false }} />
        <Stack.Screen name="walletconnect/index" options={{ headerShown: true, title: 'Connected dApps' }} />
        <Stack.Screen name="walletconnect/pair" options={{ headerShown: true, title: 'Connect a dApp' }} />
        <Stack.Screen name="walletconnect/[topic]" options={{ headerShown: true, title: 'Session' }} />
        <Stack.Screen name="walletconnect/request" options={{ headerShown: true, title: 'Request', gestureEnabled: false }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="tokens/add" options={{ headerShown: true, title: 'Add token' }} />
        <Stack.Screen name="settings/networks" options={{ headerShown: true, title: 'Networks' }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: true, title: 'Appearance' }} />
        <Stack.Screen name="settings/currency" options={{ headerShown: true, title: 'Currency' }} />
        <Stack.Screen name="settings/about" options={{ headerShown: true, title: 'About' }} />
        <Stack.Screen name="settings/security/index" options={{ headerShown: true, title: 'Security' }} />
        <Stack.Screen name="settings/security/pin" options={{ headerShown: true, title: 'Change PIN' }} />
        <Stack.Screen name="settings/security/reveal" options={{ headerShown: true, title: 'Recovery phrase' }} />
      </Stack.Protected>
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const dark = useIsDark();
  const c = dark ? Colors.dark : Colors.light;
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.background, card: c.background, text: c.text, border: c.border, primary: c.primary } };
  return (
    <ThemeProvider value={navTheme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RootStack />
        </SessionProvider>
      </QueryClientProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
