import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { HoldRing } from '@/components/fx/skia';
import { usePressScale } from '@/components/ui';
import { ChainHue, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Durations, haptic, Springs, useMotion } from '@/motion';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = usePressScale(0.92);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          haptic.selection();
          onPress();
        }}
        style={[s.chip, { backgroundColor: active ? t.primary : t.surface, borderColor: active ? t.primary : t.border }]}>
        <Text style={{ color: active ? t.onPrimary : t.text, fontSize: 13, fontFamily: Fonts.uiSemi }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Segmented pills with a spring-sliding indicator (UI thread). */
export function SegmentedPills<K extends string>({ items, value, onChange, testID }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; testID?: string }) {
  const t = useTheme();
  const { reduced } = useMotion();
  const layouts = useRef<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const move = (k: K, animate: boolean) => {
    const l = layouts.current[k];
    if (!l) return;
    if (animate && !reduced) {
      x.set(withSpring(l.x, Springs.gentle));
      w.set(withSpring(l.w, Springs.gentle));
    } else {
      x.set(l.x);
      w.set(l.w);
    }
  };
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], width: w.get() }));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} style={s.segScroll} contentContainerStyle={[s.seg, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Animated.View style={[s.segIndicator, { backgroundColor: t.surfaceRaised, borderColor: t.accent }, indicator]} />
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onLayout={(e: LayoutChangeEvent) => {
              layouts.current[it.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (active) move(it.key, false);
            }}
            onPress={() => {
              haptic.selection();
              move(it.key, true);
              onChange(it.key);
            }}
            style={s.segItem}>
            <Text style={{ color: active ? t.text : t.textSecondary, fontFamily: active ? Fonts.uiSemi : Fonts.uiMedium, fontSize: 13 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Shimmer skeleton: a translucent band sweeps across (UI thread). Reduced motion: static block. */
export function Skeleton({ height = 56 }: { height?: number }) {
  const t = useTheme();
  const { reduced } = useMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduced) return;
    x.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(x);
  }, [reduced, x]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * w }] }));
  return (
    <View
      testID="skeleton"
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: Radius.md, backgroundColor: t.surface, overflow: 'hidden' }}>
      {!reduced && w > 0 && <Animated.View style={[s.band, { width: w * 0.6, backgroundColor: t.surfaceRaised }, band]} />}
    </View>
  );
}

/** Chain-tinted orb with the token's initial. */
export function TokenOrb({ chain, symbol, size = 40 }: { chain: string; symbol: string; size?: number }) {
  const t = useTheme();
  const hue = ChainHue[chain] ?? t.accent;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hue + '26', borderWidth: 1, borderColor: hue + '80', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: hue, fontFamily: Fonts.display, fontSize: size * 0.42 }}>{symbol.slice(0, 1)}</Text>
    </View>
  );
}

/** 6 PIN dots: filled dots spring; `shakeKey` changes trigger a shake (no shake with reduced motion). */
export function PinDots({ length, filled, error, shakeKey }: { length: number; filled: number; error?: boolean; shakeKey: number }) {
  const t = useTheme();
  const { reduced } = useMotion();
  const dx = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey) return;
    haptic.error();
    if (reduced) return;
    dx.set(withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 50 })));
  }, [shakeKey, reduced, dx]);
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }] }));
  return (
    <Animated.View style={[s.dots, row]} accessibilityLabel={`${filled} of ${length} digits entered`}>
      {Array.from({ length }, (_, i) => (
        <PinDot key={i} on={i < filled} color={error ? t.danger : t.primary} border={t.border} />
      ))}
    </Animated.View>
  );
}

function PinDot({ on, color, border }: { on: boolean; color: string; border: string }) {
  const { reduced } = useMotion();
  const sc = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    sc.set(reduced ? (on ? 1 : 0) : withSpring(on ? 1 : 0, Springs.snappy));
  }, [on, reduced, sc]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: sc.get() }] }));
  return (
    <View style={[s.dot, { borderColor: on ? color : border }]}>
      <Animated.View style={[s.dotFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

/**
 * Press and hold for `ms` to fire. Releasing early cancels. Progress drives a Skia ring and a
 * fill (both UI thread); haptic ticks at 33 % / 66 %, success at 100 %.
 */
export function HoldToConfirm({ label, onConfirm, disabled, ms = Durations.hold }: { label: string; onConfirm: () => void; disabled?: boolean; ms?: number }) {
  const t = useTheme();
  const p = useSharedValue(0);
  const [busy, setBusy] = useState(false);
  const fire = () => {
    haptic.success();
    setBusy(true);
    Promise.resolve(onConfirm()).finally(() => {
      setBusy(false);
      p.set(0);
    });
  };
  useAnimatedReaction(
    () => Math.floor(p.get() * 3),
    (step, prev) => {
      if (prev !== null && step > prev && step < 3) runOnJS(haptic.light)();
    },
  );
  const start = () => {
    if (disabled || busy) return;
    haptic.light();
    p.set(
      withTiming(1, { duration: ms, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(fire)();
      }),
    );
  };
  const cancel = () => {
    if (busy) return;
    cancelAnimation(p);
    p.set(withTiming(0, { duration: 150 }));
  };
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
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
      style={[s.hold, { backgroundColor: t.surface, borderColor: t.border, opacity: disabled ? 0.4 : 1 }]}>
      <Animated.View style={[s.holdFill, { backgroundColor: t.primary + '33' }, fill]} />
      <View style={s.holdRow}>
        <HoldRing progress={p} size={36} color={t.primary} track={t.border} />
        <Text style={{ color: t.text, fontFamily: Fonts.uiSemi, fontSize: FontSize.body }}>{busy ? 'Sending…' : label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1 },
  segScroll: { flexGrow: 0, alignSelf: 'flex-start', maxWidth: '100%' },
  seg: { flexDirection: 'row', alignItems: 'center', padding: 4, borderRadius: Radius.pill, borderWidth: 1 },
  segItem: { paddingHorizontal: 14, paddingVertical: 8 },
  segIndicator: { position: 'absolute', top: 4, bottom: 4, left: 0, borderRadius: Radius.pill, borderWidth: 1 },
  hold: { height: 64, borderRadius: Radius.pill, borderWidth: 1, overflow: 'hidden', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, opacity: 0.9, borderRadius: Radius.md },
  dots: { flexDirection: 'row', gap: 14, alignSelf: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
});
