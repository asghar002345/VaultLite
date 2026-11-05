import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { alpha, Fonts, Radius, Spacing } from '@/constants/theme';
import { formatAmount } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';

import type { EscrowStatus, Milestone } from './types';

export function StatusPill({ status }: { status: EscrowStatus }) {
  const t = useTheme();
  const c = { Funded: t.primary, Created: t.textSecondary, Disputed: t.danger, Completed: t.success, Resolved: t.textSecondary, Cancelled: t.textTertiary, Refunded: t.textSecondary, None: t.textTertiary }[status];
  return (
    <View style={[s.pill, { borderColor: alpha(c, 0.4), backgroundColor: alpha(c, 0.1) }]}>
      <Text style={{ color: c, fontFamily: Fonts.uiMedium, fontSize: 11, letterSpacing: 0.88 }}>{status.toUpperCase()}</Text>
    </View>
  );
}

/** Milestone timeline: dots joined by a track, coloured by status. */
export function MilestoneTrack({ milestones }: { milestones: Milestone[] }) {
  const t = useTheme();
  const color = (st: Milestone['status']) => (st === 'Released' || st === 'Resolved' ? t.primary : st === 'Submitted' ? t.textSecondary : st === 'Refunded' ? t.danger : t.border);
  return (
    <View style={s.track} accessibilityLabel={milestones.map((m) => `Milestone ${m.index + 1} ${m.status}`).join(', ')}>
      {milestones.map((m, i) => (
        <View key={m.index} style={s.seg}>
          {i > 0 && <View style={[s.line, { backgroundColor: color(m.status) }]} />}
          <View style={[s.dot, { backgroundColor: color(m.status), borderColor: t.surface }]} />
        </View>
      ))}
    </View>
  );
}

const MS_LABEL: Record<Milestone['status'], string> = { Pending: 'Pending', Submitted: 'Under review', Released: 'Released', Refunded: 'Refunded', Resolved: 'Resolved' };
const MS_ICON: Record<Milestone['status'], IconName> = { Pending: 'lock', Submitted: 'pending', Released: 'check', Refunded: 'undo', Resolved: 'dispute' };

/** Vertical milestone timeline (escrow detail): status node, amount, review state; the active one is highlighted. */
export function MilestoneTimeline({ milestones, reviewPeriod, nowSec }: { milestones: Milestone[]; reviewPeriod: number; nowSec: number }) {
  const t = useTheme();
  const active = milestones.find((m) => m.status === 'Submitted' || m.status === 'Pending')?.index;
  return (
    <View style={[s.tl, { borderColor: t.border, backgroundColor: t.surface }]}>
      {milestones.map((m, i) => {
        const on = m.index === active;
        const done = m.status === 'Released' || m.status === 'Resolved';
        const due = m.status === 'Submitted' ? m.submittedAt + reviewPeriod - nowSec : null;
        return (
          <View key={m.index} style={[s.tlRow, on && { backgroundColor: t.surfaceRaised }]} accessibilityLabel={`Milestone ${m.index + 1}, ${formatAmount(m.amount, 6)} USDC, ${MS_LABEL[m.status]}`}>
            <View style={{ alignItems: 'center' }}>
              <View style={[s.node, { borderColor: on || done ? t.primary : t.border, backgroundColor: done ? alpha(t.primary, 0.15) : t.surface }]}>
                <Icon name={MS_ICON[m.status]} size="sm" tint={on || done ? t.primary : t.textTertiary} />
              </View>
              {i < milestones.length - 1 && <View style={[s.rail, { backgroundColor: t.border }]} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: on ? t.primary : t.textSecondary, fontFamily: Fonts.uiMedium, fontSize: 12, letterSpacing: 0.96 }}>MILESTONE {String(m.index + 1).padStart(2, '0')}</Text>
                <Text style={{ color: t.textTertiary, fontFamily: Fonts.mono, fontSize: 12 }}>{due !== null ? (due > 0 ? `${Math.ceil(due / 3600)}h left in review` : 'Claimable') : ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: on ? t.primary : t.text, fontFamily: Fonts.mono, fontSize: 14 }}>{formatAmount(m.amount, 6)} USDC</Text>
                <View style={[s.tag, { backgroundColor: t.background, borderColor: t.border }]}>
                  <Text style={{ color: t.textSecondary, fontFamily: Fonts.mono, fontSize: 11 }}>{MS_LABEL[m.status]}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  tl: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', paddingVertical: Spacing.sm },
  tlRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.smd },
  node: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rail: { width: 1, flex: 1, minHeight: 16, marginTop: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm, borderWidth: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, borderWidth: 1 },
  track: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  seg: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  line: { flex: 1, height: 3, borderRadius: 2, marginHorizontal: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
