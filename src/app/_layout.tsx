import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

import { loadSettings } from '@/store/settings';

import { Colors, Fonts } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';

import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SessionProvider, useSession } from '@/vault/session';
import { WalletConnectHost } from '@/walletconnect/provider';
import { MarketHost } from '@/services/market/host';
import { bindOnlineManager } from '@/services/market/offline';

bindOnlineManager(onlineManager);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2 } } });

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    GeistMono_400Regular,
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
    {status === 'unlocked' && <MarketHost />}
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
        <Stack.Screen name="escrow/[id]/index" options={{ headerShown: true, title: 'Escrow' }} />
        <Stack.Screen name="escrow/[id]/action" options={{ headerShown: true, title: 'Escrow action' }} />
        <Stack.Screen name="escrow/withdraw" options={{ headerShown: true, title: 'Withdraw' }} />
        <Stack.Screen name="receive" options={{ headerShown: true, title: 'Receive' }} />
        <Stack.Screen name="send/index" options={{ headerShown: true, title: 'Send' }} />
        <Stack.Screen name="send/review" options={{ headerShown: true, title: 'Review' }} />
        <Stack.Screen name="send/status/[hash]" options={{ headerShown: true, title: 'Status', headerBackVisible: false }} />
        <Stack.Screen name="escrow/index" options={{ headerShown: true, title: 'Escrow' }} />
        <Stack.Screen name="tokens/index" options={{ headerShown: true, title: 'Assets' }} />
        <Stack.Screen name="markets/index" options={{ headerShown: true, title: 'Markets' }} />
        <Stack.Screen name="markets/[symbol]" options={{ headerShown: true, title: 'Market' }} />
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
