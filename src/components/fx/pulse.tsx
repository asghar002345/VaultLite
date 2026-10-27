import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/motion';

/** Breathing ring while a tx is pending. Reduced motion: static ring. */
export function PendingPulse() {
  const t = useTheme();
  const { reduced } = useMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    v.set(withRepeat(withTiming(1, { duration: 1400 }), -1, true));
    return () => cancelAnimation(v);
  }, [reduced, v]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.get() * 0.25 }], opacity: 0.8 - v.get() * 0.5 }));
  return (
    <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Pending" accessibilityRole="progressbar">
      <Animated.View style={[{ width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: t.warning }, ring]} />
    </View>
  );
}
