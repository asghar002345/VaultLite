import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * Faint engraved guilloché motif (6% opacity) — the single permitted ornament, used only behind a hero card.
 * Static vector, no animation; geometry taken from the v3 Stitch export.
 */
export function Guilloche({ opacity = 0.06 }: { opacity?: number }) {
  const t = useTheme();
  const c = t.text;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 342 190" preserveAspectRatio="xMidYMid slice">
        {[30, 50, 70, 90, 110, 130, 150].map((r) => (
          <Circle key={r} cx={171} cy={95} r={r} stroke={c} strokeWidth={1} fill="none" />
        ))}
        <Path d="M0 0L342 190M342 0L0 190" stroke={c} strokeWidth={0.8} />
        <Ellipse cx={171} cy={95} rx={160} ry={60} stroke={c} strokeWidth={0.75} fill="none" />
        <Ellipse cx={171} cy={95} rx={60} ry={160} stroke={c} strokeWidth={0.75} fill="none" />
        {[30, -30, 60, -60].map((a) => (
          <Ellipse key={a} cx={171} cy={95} rx={130} ry={40} stroke={c} strokeWidth={0.75} fill="none" transform={`rotate(${a} 171 95)`} />
        ))}
      </Svg>
    </View>
  );
}
