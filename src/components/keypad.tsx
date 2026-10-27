import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/motion';

/** Pure: apply one keypad key to a value (digits, '.', 'back'), respecting a max length and one decimal point. */
export function applyKey(value: string, key: string, opts: { maxLength?: number; decimal?: boolean } = {}): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === '.') {
    if (!opts.decimal || value.includes('.')) return value;
    return value === '' ? '0.' : value + '.';
  }
  if (!/^\d$/.test(key)) return value;
  if (opts.maxLength !== undefined && value.length >= opts.maxLength) return value;
  if (opts.decimal && value === '0') return key;
  return value + key;
}

function Key({ k, label, icon, a11y, round, disabled, onKey, testIDPrefix }: { k: string; label?: string; icon?: IconName; a11y: string; round?: boolean; disabled?: boolean; onKey: (k: string) => void; testIDPrefix: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={`${testIDPrefix}-${k}`}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onKey(k);
      }}
      style={({ pressed }) => [round ? s.round : s.rect, { backgroundColor: pressed ? t.surfaceRaised : icon && !label ? 'transparent' : t.surface, opacity: disabled ? 0.4 : 1 }]}>
      {icon ? <Icon name={icon} tint={k === 'back' ? t.textSecondary : t.primary} /> : <Text style={[s.digit, { color: t.text }]}>{label ?? k}</Text>}
    </Pressable>
  );
}

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];

/**
 * Numeric keypad (PIN lock, amounts). `left` is an optional extra key (biometrics, or '.' for amounts).
 * On web, the hardware keyboard drives it too.
 */
export function Keypad({
  onKey,
  left,
  testIDPrefix = 'key',
  disabled,
  round,
}: {
  onKey: (key: string) => void;
  left?: { key: string; label?: string; icon?: IconName; accessibilityLabel: string } | null;
  testIDPrefix?: string;
  disabled?: boolean;
  /** Round PIN keys (lock) vs rounded-rect amount keys. */
  round?: boolean;
}) {
  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) onKey(e.key);
      else if (e.key === 'Backspace') onKey('back');
      else if (e.key === '.' && left?.key === '.') onKey('.');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onKey, disabled, left?.key]);

  const kp = { round, disabled, onKey, testIDPrefix };
  return (
    <View style={s.pad} accessibilityLabel="Keypad">
      {ROWS.map((r) => (
        <View key={r[0]} style={s.row}>
          {r.map((d) => <Key key={d} {...kp} k={d} a11y={d} />)}
        </View>
      ))}
      <View style={s.row}>
        {left ? <Key {...kp} k={left.key} label={left.label} icon={left.icon} a11y={left.accessibilityLabel} /> : <View style={round ? s.round : s.rect} />}
        <Key {...kp} k="0" a11y="0" />
        <Key {...kp} k="back" icon="backspace" a11y="Delete" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pad: { gap: Spacing.smd, width: '100%', maxWidth: 360, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.smd, justifyContent: 'space-between' },
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginHorizontal: 'auto' },
  rect: { flex: 1, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 36 },
});
