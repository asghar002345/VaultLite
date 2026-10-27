import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useDerivedValue, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { haptic, Springs, useMotion } from '@/motion';

const N = 18;

function Particle({ i, p, fade, cx, cy, color }: { i: number; p: { value: number }; fade: { value: number }; cx: number; cy: number; color: string }) {
  const angle = (i / N) * Math.PI * 2;
  const dist = 60 + (i % 3) * 22;
  const x = useDerivedValue(() => cx + Math.cos(angle) * dist * p.value);
  const y = useDerivedValue(() => cy + Math.sin(angle) * dist * p.value);
  const r = useDerivedValue(() => (3 + (i % 3)) * (1 - 0.5 * p.value));
  return <Circle cx={x} cy={y} r={r} color={color} opacity={fade} />;
}

/** Success burst: Skia particles spring outward and fade. Reduced motion: a simple fade-in check. */
export function SuccessBurst({ size = 200 }: { size?: number }) {
  const t = useTheme();
  const { reduced } = useMotion();
  const p = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    haptic.success();
    if (reduced) return;
    p.set(withSpring(1, Springs.bouncy));
    fade.set(withDelay(350, withTiming(0, { duration: 600 })));
  }, [reduced, p, fade]);
  const colors = [t.primary, t.accent, t.accentWarm];
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} accessibilityLabel="Success" accessibilityRole="image">
      {!reduced && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group>
            {Array.from({ length: N }, (_, i) => (
              <Particle key={i} i={i} p={p} fade={fade} cx={size / 2} cy={size / 2} color={colors[i % 3]} />
            ))}
          </Group>
        </Canvas>
      )}
      <Animated.View style={[styles.check, { backgroundColor: t.primary }]}>
        <Animated.Text style={{ color: t.onPrimary, fontSize: 36, fontWeight: '800' }}>✓</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});

