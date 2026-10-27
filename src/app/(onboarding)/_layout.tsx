import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function OnboardingLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: true, headerTitle: '', headerShadowVisible: false, headerStyle: { backgroundColor: t.background }, headerTintColor: t.text }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
    </Stack>
  );
}
