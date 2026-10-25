import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const body = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.background }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.grow}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function T({
  variant = 'body',
  style,
  ...p
}: TextProps & { variant?: 'body' | 'title' | 'hero' | 'caption' | 'mono' | 'error' }) {
  const t = useTheme();
  const v = {
    body: { fontSize: FontSize.body, color: t.text },
    title: { fontSize: FontSize.title, fontWeight: '700' as const, color: t.text },
    hero: { fontSize: FontSize.hero, fontWeight: '800' as const, color: t.text },
    caption: { fontSize: FontSize.caption, color: t.textSecondary },
    mono: { fontSize: 14, fontFamily: Fonts.mono, color: t.text },
    error: { fontSize: FontSize.body, color: t.danger },
  }[variant];
  return <Text {...p} style={[v, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Spring press-scale + light haptic. Shared by Button and Chip. */
export function usePressScale(to = 0.96) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => {
      scale.set(withSpring(to, { damping: 15, stiffness: 400 }));
    },
    onPressOut: () => {
      scale.set(withSpring(1, { damping: 12, stiffness: 300 }));
    },
  };
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const press = usePressScale();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : t.surface;
  const fg = variant === 'secondary' ? t.text : t.onPrimary;
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        void Haptics.impactAsync(variant === 'danger' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, press.style]}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: FontSize.body }}>{title}</Text>
    </AnimatedPressable>
  );
}

export function Input(p: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={p.accessibilityLabel ?? p.placeholder}
      placeholderTextColor={t.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      {...p}
      style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }, p.style]}
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>{children}</View>;
}

export function TestnetBanner() {
  const t = useTheme();
  return (
    <View testID="testnet-banner" accessibilityRole="header" accessibilityLabel="Warning: testnet only. Tokens have no real value." style={[styles.banner, { backgroundColor: t.warning }]}>
      <Text style={{ color: t.onWarning, fontWeight: '700', textAlign: 'center' }}>
        TESTNET ONLY — tokens have no real value
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  inner: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  btn: { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.body },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  banner: { padding: Spacing.sm, borderRadius: Radius.sm },
});
