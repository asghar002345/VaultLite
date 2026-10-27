import { Text, View } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** "VL" monogram tile — the only brand mark (lock screen, welcome, header). */
export function Monogram({ size = 64 }: { size?: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="VaultLite"
      style={{ width: size, height: size, borderRadius: size > 40 ? Radius.lg : Radius.sm, backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.primary, fontFamily: Fonts.mono, fontSize: size * 0.24, letterSpacing: size * 0.02 }}>VL</Text>
    </View>
  );
}
