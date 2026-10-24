import type { ReactNode } from 'react';
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

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : t.surface;
  const fg = variant === 'secondary' ? t.text : t.onPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: FontSize.body }}>{title}</Text>
    </Pressable>
  );
}

export function Input(p: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
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
    <View testID="testnet-banner" style={[styles.banner, { backgroundColor: t.warning }]}>
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
