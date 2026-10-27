import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { EscrowStatus, Milestone } from './types';

export function StatusPill({ status }: { status: EscrowStatus }) {
  const t = useTheme();
  const c = { Funded: t.primary, Created: t.accent, Disputed: t.danger, Completed: t.success, Resolved: t.textSecondary, Cancelled: t.textSecondary, Refunded: t.accentWarm, None: t.textSecondary }[status];
  return (
    <View style={[s.pill, { borderColor: c + '66', backgroundColor: c + '1A' }]}>
      <Text style={{ color: c, fontFamily: Fonts.uiSemi, fontSize: 11, letterSpacing: 0.6 }}>{status.toUpperCase()}</Text>
    </View>
  );
}

/** Milestone timeline: dots joined by a track, coloured by status. */
export function MilestoneTrack({ milestones }: { milestones: Milestone[] }) {
  const t = useTheme();
  const color = (st: Milestone['status']) => (st === 'Released' || st === 'Resolved' ? t.primary : st === 'Submitted' ? t.accent : st === 'Refunded' ? t.accentWarm : t.border);
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

const s = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, borderWidth: 1 },
  track: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  seg: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  line: { flex: 1, height: 3, borderRadius: 2, marginHorizontal: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
