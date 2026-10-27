import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Aurora } from '@/components/fx/skia';
import { Button, Screen, T, TestnetBanner } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/motion';

export default function Welcome() {
  const t = useTheme();
  const m = useMotion();
  return (
    <Screen scroll={false} backdrop={<Aurora intensity={1.1} />}>
      <TestnetBanner />
      <View style={s.center}>
        <Animated.View entering={m.enter(0)}>
          <T style={[s.word, { color: t.text }]}>
            vault<T style={[s.word, { color: t.primary }]}>lite</T>
          </T>
        </Animated.View>
        <Animated.View entering={m.enter(2)}>
          <T style={s.tag}>Keys that never leave your hands.</T>
        </Animated.View>
        <Animated.View entering={m.enter(3)}>
          <T variant="caption" style={{ textAlign: 'center' }}>Self-custodial · multi-chain · testnets only</T>
        </Animated.View>
      </View>
      <Animated.View entering={m.enter(5)} style={{ gap: Spacing.sm }}>
        <Button testID="create" title="Create new wallet" onPress={() => router.push('/create')} />
        <Button testID="import" variant="ghost" title="Import existing wallet" onPress={() => router.push('/import')} />
      </Animated.View>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  word: { fontFamily: Fonts.display, fontSize: 64, letterSpacing: -3 },
  tag: { fontFamily: Fonts.displayMedium, fontSize: 20, textAlign: 'center', letterSpacing: -0.3 },
});
