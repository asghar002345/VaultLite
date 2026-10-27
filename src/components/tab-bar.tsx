import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Fonts, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/motion';

const ICON: Record<string, IconName> = { home: 'home', activity: 'activity', connect: 'connect', settings: 'settings' };

/** Flat bottom bar on a hairline (v3): brass icon marks the active tab; compact single-row items in landscape. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height && height < 500;
  return (
    <View style={[s.wrap, { backgroundColor: t.background, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, landscape ? 4 : 10) }]}>
      <View style={[s.bar, { maxWidth: Layout.maxContent }]}>
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
                  navigateToTab(route.key);
                }
              }}
              style={[s.item, landscape && s.itemLandscape]}>
              <Icon name={ICON[route.name] ?? 'info'} size="md" tint={focused ? t.primary : t.textTertiary} />
              <Text style={{ color: focused ? t.text : t.textTertiary, fontFamily: Fonts.uiMedium, fontSize: 11, letterSpacing: 0.4 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, alignItems: 'center' },
  bar: { flexDirection: 'row', width: '100%', paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 },
  itemLandscape: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 4 },
});
