import { BlurMask, Canvas, Circle, RadialGradient, Rect, useClock, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/motion';

type Blob = { color: string; r: number; ax: number; ay: number; px: number; py: number; speed: number; phase: number };

/** One orbiting radial-gradient blob; position derived from the Skia clock on the UI thread. */
function AuroraBlob({ b, w, h, clock, still }: { b: Blob; w: number; h: number; clock: { value: number }; still: boolean }) {
  const t = useDerivedValue(() => (still ? b.phase : (clock.value / 1000) * b.speed + b.phase));
  const cx = useDerivedValue(() => w * (b.px + b.ax * Math.cos(t.value)));
  const cy = useDerivedValue(() => h * (b.py + b.ay * Math.sin(t.value * 1.3)));
  const c = useDerivedValue(() => vec(cx.value, cy.value));
  const r = Math.max(w, h) * b.r;
  return (
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient c={c} r={r} colors={[b.color, b.color + '00']} />
      <BlurMask blur={24} style="normal" />
    </Circle>
  );
}

/**
 * Animated aurora mesh (Skia). Three blurred gradients orbit slowly; with reduce-motion the
 * frame is static. Purely decorative — hidden from accessibility.
 */
export function Aurora({ style, intensity = 1 }: { style?: ViewStyle; intensity?: number }) {
  const t = useTheme();
  const dark = useIsDark();
  const { reduced } = useMotion();
  const clock = useClock();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const a = Math.round(Math.min(1, (dark ? 0.5 : 0.35) * intensity) * 255).toString(16).padStart(2, '0');
  const blobs: Blob[] = [
    { color: t.primary + a, r: 0.42, ax: 0.25, ay: 0.2, px: 0.25, py: 0.35, speed: 0.35, phase: 0 },
    { color: t.accent + a, r: 0.45, ax: 0.22, ay: 0.25, px: 0.75, py: 0.45, speed: 0.27, phase: 2 },
    { color: t.accentWarm + a, r: 0.3, ax: 0.3, ay: 0.18, px: 0.5, py: 0.9, speed: 0.4, phase: 4 },
  ];
  return (
    <View style={[StyleSheet.absoluteFill, style]} onLayout={onLayout} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {size.w > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={size.w} height={size.h} color="transparent" />
          {blobs.map((b, i) => (
            <AuroraBlob key={i} b={b} w={size.w} h={size.h} clock={clock} still={reduced} />
          ))}
        </Canvas>
      )}
    </View>
  );
}
