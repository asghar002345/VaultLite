import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { usePressScale } from '@/components/ui';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.92);
  return (
    <Reanimated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          void Haptics.selectionAsync();
          onPress();
        }}
        style={[s.chip, { backgroundColor: active ? t.primary : t.surface, borderColor: t.border }]}>
        <Text style={{ color: active ? t.onPrimary : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

export function Skeleton({ height = 56 }: { height?: number }) {
  const t = useTheme();
  const o = useState(() => new Animated.Value(0.4))[0];
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View testID="skeleton" accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ height, borderRadius: Radius.md, backgroundColor: t.surface, opacity: o }} />;
}

/** Press and hold for `ms` to fire. Releasing early cancels. */
export function HoldToConfirm({ label, onConfirm, disabled, ms = 1500 }: { label: string; onConfirm: () => void; disabled?: boolean; ms?: number }) {
  const t = useTheme();
  const p = useState(() => new Animated.Value(0))[0];
  const [busy, setBusy] = useState(false);
  const start = () => {
    if (disabled || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(p, { toValue: 1, duration: ms, useNativeDriver: false }).start(({ finished }) => {
      if (finished) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setBusy(true);
        Promise.resolve(onConfirm()).finally(() => {
          setBusy(false);
          p.setValue(0);
        });
      }
    });
  };
  const cancel = () => {
    if (busy) return;
    p.stopAnimation();
    Animated.timing(p, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };
  const width = p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable
      testID="hold-to-confirm"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to confirm. Screen reader users: double-tap to activate."
      accessibilityState={{ disabled: !!disabled, busy }}
      accessibilityActions={[{ name: 'activate' }]}
      // Holding isn't possible with TalkBack/VoiceOver; the 'activate' action confirms directly.
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !disabled && !busy) {
          setBusy(true);
          Promise.resolve(onConfirm()).finally(() => setBusy(false));
        }
      }}
      disabled={disabled}
      onPressIn={start}
      onPressOut={cancel}
      style={[s.hold, { backgroundColor: t.surface, borderColor: t.primary, opacity: disabled ? 0.4 : 1 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { width, backgroundColor: t.primary, opacity: 0.35 }]} />
      <View style={s.center}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: FontSize.body }}>{busy ? 'Sending…' : label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1 },
  hold: { height: 56, borderRadius: Radius.md, borderWidth: 2, overflow: 'hidden', justifyContent: 'center' },
  center: { alignItems: 'center' },
});
