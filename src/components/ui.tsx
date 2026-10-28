import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBreakpoint, useTabInset } from '@/components/layout';
import { Fonts, FontSize, Layout, MaxScale, Radius, Spacing, Tabular, TextRoles, Weight } from '@/constants/theme';
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
        { maxWidth: wide ? Layout.maxContentWide : Layout.maxContent, padding: compact ? Spacing.md : Layout.margin, paddingTop: Spacing.lg },
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

type Variant = 'body' | 'title' | 'hero' | 'headline' | 'overline' | 'caption' | 'label' | 'mono' | 'error' | 'amount' | 'largeTitle' | 'footnote' | 'number';
/** Text with semantic roles (see TextRoles). Serif only for title/largeTitle; numbers use system tabular figures. */
export function T({ variant = 'body', style, ...p }: TextProps & { variant?: Variant }) {
  const t = useTheme();
  const v = {
    body: { ...TextRoles.body, color: t.text },
    label: { ...TextRoles.callout, color: t.text },
    headline: { fontSize: FontSize.headline, lineHeight: 26, fontFamily: Fonts.uiMedium, fontWeight: Weight.medium, color: t.text },
    largeTitle: { ...TextRoles.largeTitle, color: t.text },
    title: { ...TextRoles.title, color: t.text },
    hero: { ...TextRoles.displayNumber, color: t.text },
    number: { ...TextRoles.numeric, color: t.text },
    overline: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.uiMedium, fontWeight: Weight.medium, color: t.textSecondary, letterSpacing: 0.96, textTransform: 'uppercase' as const },
    caption: { ...TextRoles.footnote, color: t.textSecondary },
    footnote: { ...TextRoles.caption, color: t.textSecondary },
    mono: { fontSize: FontSize.mono, lineHeight: 18, fontFamily: Fonts.mono, color: t.text },
    error: { ...TextRoles.footnote, fontFamily: Fonts.uiMedium, fontWeight: Weight.medium, color: t.danger },
    amount: { ...TextRoles.numeric, color: t.text, ...Tabular },
  }[variant];
  const cap = variant === 'hero' || variant === 'largeTitle' ? MaxScale.display : p.maxFontSizeMultiplier;
  return <Text {...p} maxFontSizeMultiplier={cap} style={[v, style]} />;
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
  const fg = variant === 'secondary' || variant === 'ghost' ? t.text : variant === 'danger' ? t.onDanger : t.onPrimary;
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
        variant === 'secondary' && { borderWidth: 1, borderColor: t.border },
        variant === 'ghost' && { minHeight: 44 },
        press.style,
      ]}>
      <View style={styles.btnRow}>
        {icon ? <Icon name={icon} size="md" tint={fg} /> : null}
        <Text style={{ color: variant === 'ghost' ? t.textSecondary : fg, fontFamily: Fonts.uiMedium, fontWeight: Weight.medium, fontSize: FontSize.body }}>{title}</Text>
      </View>
    </AnimatedPressable>
  );
}

export function Input(p: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={p.accessibilityLabel ?? p.placeholder}
      placeholderTextColor={t.textTertiary}
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
      style={[styles.banner, { borderColor: t.border, backgroundColor: t.surface }]}>
      <View style={[styles.dot, { backgroundColor: t.primary }]} />
      <Text style={{ color: t.textSecondary, fontFamily: Fonts.uiMedium, fontSize: 12, letterSpacing: 0.96 }}>TESTNET</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  inner: { flex: 1, gap: Spacing.lg, width: '100%', alignSelf: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { minHeight: 56, justifyContent: 'center', paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, minHeight: 56, fontSize: FontSize.body },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.smd },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
