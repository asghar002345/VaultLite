import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { Button, Card, Input, T } from '@/components/ui';
import { Skeleton } from '@/components/wallet';
import { alpha, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { humanizeError } from '@/lib/errors';
import { haptic, useMotion } from '@/motion';

/** Reusable state kit — every screen renders these for loading / empty / error / success / disabled. */

export function LoadingState({ rows = 3, label, height = 64 }: { rows?: number; label?: string; height?: number }) {
  return (
    <View testID="state-loading" style={{ gap: Spacing.sm }} accessibilityLabel={label ?? 'Loading'}>
      {label ? <T variant="caption">{label}</T> : null}
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </View>
  );
}

function StateBlock({ icon, tone, title, body, children, testID }: { icon: IconName; tone: 'textSecondary' | 'danger' | 'success' | 'warning'; title: string; body?: string; children?: ReactNode; testID: string }) {
  const t = useTheme();
  const m = useMotion();
  return (
    <Animated.View entering={m.fade()} testID={testID} style={[s.block, { borderColor: t.border, backgroundColor: t.surface }]} accessibilityRole="summary">
      <View style={[s.badge, { backgroundColor: alpha(t[tone], 0.12) }]}>
        <Icon name={icon} size="lg" color={tone} />
      </View>
      <T variant="label" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T variant="caption" style={{ textAlign: 'center' }}>{body}</T> : null}
      {children ? <View style={{ alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.xs }}>{children}</View> : null}
    </Animated.View>
  );
}

export function EmptyState({ icon = 'empty', title, body, action }: { icon?: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <StateBlock testID="state-empty" icon={icon} tone="textSecondary" title={title} body={body}>
      {action ? <Button variant="secondary" title={action.label} onPress={action.onPress} /> : null}
    </StateBlock>
  );
}

export function ErrorState({ error, title = 'Something went wrong', onRetry }: { error: unknown; title?: string; onRetry?: () => void }) {
  return (
    <StateBlock testID="state-error" icon="danger" tone="danger" title={title} body={humanizeError(error)}>
      {onRetry ? <Button variant="secondary" icon="refresh" title="Try again" onPress={onRetry} /> : null}
    </StateBlock>
  );
}

export function SuccessState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <StateBlock testID="state-success" icon="success" tone="success" title={title} body={body}>
      {children}
    </StateBlock>
  );
}

/** Inline notice: info, warning, danger or the reason an action is disabled. */
export function Notice({ tone = 'info', children, testID }: { tone?: 'info' | 'warning' | 'danger' | 'disabled'; children: ReactNode; testID?: string }) {
  const t = useTheme();
  const c = { info: t.accent, warning: t.warning, danger: t.danger, disabled: t.textSecondary }[tone];
  const icon: IconName = { info: 'info', warning: 'warning', danger: 'danger', disabled: 'ban' }[tone] as IconName;
  return (
    <View testID={testID} accessibilityRole={tone === 'danger' ? 'alert' : 'text'} style={[s.notice, { borderColor: alpha(c, 0.4), backgroundColor: alpha(c, 0.08) }]}>
      <Icon name={icon} size="sm" tint={c} />
      <T variant="caption" style={{ color: tone === 'disabled' ? t.textSecondary : t.text, flex: 1 }}>{children}</T>
    </View>
  );
}

/** Labelled form field with helper and error line — the only input layout used in forms. */
export function Field({ label, helper, error, children }: { label: string; helper?: string; error?: string | null; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {children}
      {error ? (
        <View style={s.fieldErr} accessibilityRole="alert">
          <Icon name="danger" size="sm" color="danger" />
          <T variant="error" style={{ flex: 1 }}>{error}</T>
        </View>
      ) : helper ? (
        <T variant="caption" style={{ color: t.textSecondary }}>{helper}</T>
      ) : null}
    </View>
  );
}

export function PinField({ value, onChange, label = 'PIN', testID, error, helper }: { value: string; onChange: (v: string) => void; label?: string; testID?: string; error?: string | null; helper?: string }) {
  return (
    <Field label={label} error={error} helper={helper}>
      <Input testID={testID} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" keyboardType="number-pad" secureTextEntry maxLength={6} />
    </Field>
  );
}

/** Tappable list row used by settings and lists. */
export function ListRow({ icon, title, subtitle, value, onPress, danger, testID, right }: { icon?: IconName; title: string; subtitle?: string; value?: string; onPress?: () => void; danger?: boolean; testID?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, value, subtitle].filter(Boolean).join(', ')}
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      style={({ pressed }) => [s.row, { backgroundColor: pressed ? t.surfaceRaised : t.surface, borderColor: t.border }]}>
      {icon ? (
        <View style={[s.rowIcon, { backgroundColor: alpha(danger ? t.danger : t.accent, 0.12) }]}>
          <Icon name={icon} size="md" color={danger ? 'danger' : 'accent'} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="label" style={danger ? { color: t.danger } : undefined}>{title}</T>
        {subtitle ? <T variant="caption">{subtitle}</T> : null}
      </View>
      {value ? <T variant="caption">{value}</T> : null}
      {right}
      {onPress && !right ? <Icon name="chevron" size="sm" color="textSecondary" /> : null}
    </Pressable>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {title ? <T variant="caption" style={{ letterSpacing: 1 }}>{title.toUpperCase()}</T> : null}
      {children}
    </View>
  );
}

/** Cross-platform destructive/important confirmation (replaces Alert.alert, which is a no-op on web). */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  confirmDisabled,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const t = useTheme();
  const m = useMotion();
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View entering={m.fade()} style={[s.scrim, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <Animated.View entering={m.sheet()} style={s.sheetWrap}>
          <Card raised style={{ borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md }}>
            <View style={[s.grab, { backgroundColor: t.border }]} />
            <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
              <Icon name={danger ? 'danger' : 'info'} color={danger ? 'danger' : 'accent'} />
              <T variant="title" style={{ fontSize: 20, flex: 1 }}>{title}</T>
            </View>
            {body ? <T variant="caption" style={{ fontSize: 14 }}>{body}</T> : null}
            {children}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button testID="confirm-sheet-ok" variant={danger ? 'danger' : 'primary'} title={busy ? 'Working…' : confirmLabel} disabled={busy || confirmDisabled} onPress={onConfirm} />
            <Button variant="ghost" title="Cancel" disabled={busy} onPress={onCancel} />
          </Card>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  block: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', padding: 12, borderRadius: Radius.md, borderWidth: 1 },
  fieldErr: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, borderWidth: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheetWrap: { padding: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center' },
});
