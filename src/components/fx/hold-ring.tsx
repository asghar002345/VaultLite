import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

/** Skia progress ring; `progress` (0..1) is a shared value so the arc animates on the UI thread. */
export function HoldRing({ progress, size, color, track }: { progress: SharedValue<number>; size: number; color: string; track: string }) {
  const stroke = 4;
  const r = size / 2 - stroke;
  const c = size / 2;
  // Full circle as two SVG arcs, starting at 3 o'clock (canvas is rotated -90° so it starts at 12).
  const path = `M ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c}`;
  return (
    <Canvas style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} style="stroke" strokeWidth={stroke} color={track} />
      <Path path={path} style="stroke" strokeWidth={stroke} strokeCap="round" color={color} start={0} end={progress} />
    </Canvas>
  );
}
