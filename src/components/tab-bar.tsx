import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic, Springs, useMotion } from '@/motion';

const ICON: Record<string, IconName> = { home: 'home', activity: 'activity', connect: 'connect', settings: 'settings' };

/** Floating tab bar with a spring-sliding pill indicator. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const t = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const landscape = winW > winH && winH < 500;
  const [w, setW] = useState(0);
  const n = state.routes.length;
  const seg = w / n;
  const x = useSharedValue(0);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const go = (i: number) => x.set(reduced ? i * seg : withSpring(i * seg, Springs.gentle));
  useEffect(() => {
    x.set(reduced ? state.index * seg : withSpring(state.index * seg, Springs.gentle));
  }, [state.index, seg, reduced, x]);
  return (
    <View style={[s.wrap, { paddingBottom: Math.max(insets.bottom, landscape ? 6 : 12), alignItems: 'center' }]} pointerEvents="box-none">
      <View style={[s.bar, { width: '100%', maxWidth: 560, backgroundColor: t.surface, borderColor: t.border }]} onLayout={(e) => setW(e.nativeEvent.layout.width - 12)}>
        {w > 0 && <Animated.View style={[s.pill, { width: seg, backgroundColor: t.surfaceRaised, borderColor: t.accent }, indicator]} />}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const label = descriptors[route.key].options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                if (!focused) {
                  haptic.selection();
                  go(i);
                  navigateToTab(route.key);
                }
              }}
              style={[s.item, landscape && { flexDirection: 'row', paddingVertical: 4, gap: 6, justifyContent: 'center' }]}>
              <Icon name={ICON[route.name] ?? 'info'} size="sm" tint={focused ? t.primary : t.textSecondary} />
              <Text style={{ color: focused ? t.text : t.textSecondary, fontFamily: focused ? Fonts.uiSemi : Fonts.uiMedium, fontSize: 12 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  bar: { flexDirection: 'row', borderRadius: Radius.pill, borderWidth: 1, padding: 6 },
  pill: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: Radius.pill, borderWidth: 1 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
});
