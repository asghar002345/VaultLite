import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBreakpoint, useTabInset } from '@/components/layout';
import { Fonts, FontSize, Layout, Radius, Spacing, Tabular } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Icon, type IconName } from '@/components/icon';
import { haptic, Springs, useMotion } from '@/motion';

export function Screen({
  children,
  scroll = true,
  backdrop,
  tab,
  wide,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  backdrop?: ReactNode;
  /** Tab root: pads the bottom so content clears the floating tab bar. */
  tab?: boolean;
  /** Allow the wider content column (lists/dashboards). */
  wide?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const tabInset = useTabInset();
  const { compact } = useBreakpoint();
  const body = (
    <View
      testID={testID}
      style={[
        styles.inner,
        { maxWidth: wide ? Layout.maxContentWide : Layout.maxContent, padding: compact ? Spacing.md : Spacing.lg },
        tab && { paddingBottom: tabInset },
      ]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.background }]} edges={tab ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}>
      {backdrop}
      {scroll ? <ScrollView contentContainerStyle={styles.grow} keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

type Variant = 'body' | 'title' | 'hero' | 'caption' | 'label' | 'mono' | 'error' | 'amount';
export function T({ variant = 'body', style, ...p }: TextProps & { variant?: Variant }) {
  const t = useTheme();
  const v = {
    body: { fontSize: FontSize.body, fontFamily: Fonts.ui, color: t.text },
    label: { fontSize: FontSize.label, fontFamily: Fonts.uiSemi, color: t.text },
    title: { fontSize: FontSize.title, fontFamily: Fonts.display, color: t.text, letterSpacing: -0.5 },
    hero: { fontSize: FontSize.hero, fontFamily: Fonts.display, color: t.text, letterSpacing: -1.5 },
    caption: { fontSize: FontSize.caption, fontFamily: Fonts.uiMedium, color: t.textSecondary, letterSpacing: 0.2 },
    mono: { fontSize: 13, fontFamily: Fonts.mono, color: t.text },
    error: { fontSize: FontSize.label, fontFamily: Fonts.uiMedium, color: t.danger },
    amount: { fontSize: FontSize.body, fontFamily: Fonts.uiSemi, color: t.text, ...Tabular },
  }[variant];
  return <Text {...p} style={[v, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Spring press-scale (UI thread). Reduced motion: no scale. */
export function usePressScale(to = 0.96) {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduced) scale.set(withSpring(to, Springs.snappy));
    },
    onPressOut: () => {
      scale.set(withSpring(1, Springs.snappy));
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
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: IconName;
}) {
  const t = useTheme();
  const press = usePressScale();
  const bg = { primary: t.primary, danger: t.danger, secondary: t.surfaceRaised, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? t.text : t.onPrimary;
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
        if (variant === 'danger') haptic.medium();
        else haptic.light();
        onPress();
      }}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.38 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: t.border },
        variant === 'primary' && !disabled && { shadowColor: t.primary, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
        press.style,
      ]}>
      <View style={styles.btnRow}>
        {icon ? <Icon name={icon} size="md" tint={fg} /> : null}
        <Text style={{ color: fg, fontFamily: Fonts.uiSemi, fontSize: FontSize.body, letterSpacing: 0.1 }}>{title}</Text>
      </View>
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
      style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface, fontFamily: Fonts.ui }, p.style]}
    />
  );
}

export function Card({ children, style, raised }: { children: ReactNode; style?: ViewStyle; raised?: boolean }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: raised ? t.surfaceRaised : t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function TestnetBanner() {
  const t = useTheme();
  return (
    <View
      testID="testnet-banner"
      accessibilityRole="header"
      accessibilityLabel="Warning: testnet only. Tokens have no real value."
      style={[styles.banner, { borderColor: t.warning, backgroundColor: t.warning + '1A' }]}>
      <View style={[styles.dot, { backgroundColor: t.warning }]} />
      <Text style={{ color: t.warning, fontFamily: Fonts.uiSemi, fontSize: 12, letterSpacing: 0.6 }}>TESTNET ONLY · tokens have no real value</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  inner: { flex: 1, gap: Spacing.md, width: '100%', alignSelf: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingVertical: 16, borderRadius: Radius.pill, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.body },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, borderWidth: 1, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
