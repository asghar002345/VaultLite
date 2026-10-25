import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SessionProvider, useSession } from '@/vault/session';
import { WalletConnectHost } from '@/walletconnect/provider';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2 } } });

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);
  if (status === 'loading') return null;
  return (
    <>
    {status === 'unlocked' && <WalletConnectHost />}
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'empty'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="lock" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unlocked'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="token/[chain]/[address]" options={{ headerShown: true, title: 'Token' }} />
        <Stack.Screen name="receive" options={{ headerShown: true, title: 'Receive' }} />
        <Stack.Screen name="send/index" options={{ headerShown: true, title: 'Send' }} />
        <Stack.Screen name="send/review" options={{ headerShown: true, title: 'Review' }} />
        <Stack.Screen name="send/status/[hash]" options={{ headerShown: true, title: 'Status', headerBackVisible: false }} />
        <Stack.Screen name="walletconnect/index" options={{ headerShown: true, title: 'WalletConnect' }} />
      </Stack.Protected>
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RootStack />
        </SessionProvider>
      </QueryClientProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
