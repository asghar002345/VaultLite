import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, ListRow, LoadingState, Notice, Section } from '@/components/states';
import { View } from 'react-native';

import { Guilloche } from '@/components/fx/guilloche';
import { Button, Screen, T } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { formatAmount } from '@/lib/format';
import { actionKey, availableActions, describeAction, roleOf } from '@/modules/escrow';
import { ESCROW_CHAIN, useEscrow } from '@/modules/escrow/use-escrow';
import { MilestoneTimeline, StatusPill } from '@/modules/escrow/ui';

const nowSec = () => Math.floor(Date.now() / 1000);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function EscrowDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const valid = /^\d+$/.test(id ?? '');
  const { service, me } = useEscrow();
  const q = useQuery({ queryKey: ['escrow', id], queryFn: () => service.getEscrow(ESCROW_CHAIN, BigInt(id!)), refetchInterval: 20_000, enabled: valid });

  if (!valid) return <Screen><EmptyState icon="escrow" title="Invalid escrow id" action={{ label: 'All escrows', onPress: () => router.replace('/escrow') }} /></Screen>;
  if (q.isPending) return <Screen testID="escrow-detail-loading"><LoadingState rows={4} label="Loading escrow" /></Screen>;
  if (q.isError) return <Screen><ErrorState title="Couldn't load escrow" error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const e = q.data;
  if (!e || !me) return <Screen><EmptyState icon="escrow" title="Escrow not found" body={`No escrow #${id} on Base Sepolia.`} action={{ label: 'All escrows', onPress: () => router.replace('/escrow') }} /></Screen>;

  const actions = availableActions(e, me, nowSec());
  const role = roleOf(e, me);
  const t = Colors.dark;
  const released = e.milestones.filter((m) => m.status === 'Released' || m.status === 'Resolved').reduce((x, m) => x + m.amount, 0n);
  const locked = e.total - e.settled;
  const go = (a: (typeof actions)[number]) => router.push({ pathname: '/escrow/[id]/action', params: { id: id!, a: actionKey(a) } });
  const primary = actions.find((a) => !describeAction(a, e).danger);
  const rest = actions.filter((a) => a !== primary);
  return (
    <Screen testID="escrow-detail">
      <Stack.Screen options={{ title: `Escrow #${id}` }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <T variant="overline">Escrow reference</T>
          <T variant="mono" style={{ color: t.textSecondary }}>#{id} · Base Sepolia</T>
        </View>
        <StatusPill status={e.status} />
      </View>
      <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: Spacing.lg, gap: Spacing.lg, overflow: 'hidden' }}>
        <Guilloche />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2 }}>
            <T variant="overline">Milestone escrow</T>
            <T variant="title">You are the {role}</T>
          </View>
          <T variant="mono" style={{ color: t.primary }}>{e.milestones.filter((m) => m.status === 'Released').length}/{e.milestones.length}</T>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <T variant="overline">Locked</T>
            <T variant="hero">{formatAmount(locked, 6)} <T style={{ fontFamily: Fonts.display, fontSize: 20, color: t.primary }}>USDC</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="overline">Released</T>
            <T variant="mono">{formatAmount(released, 6)} USDC</T>
          </View>
        </View>
      </View>
      <Section title="Milestones" right={<T variant="caption">{e.milestones.length} total · {formatAmount(e.total, 6)} USDC</T>}>
        <MilestoneTimeline milestones={e.milestones} reviewPeriod={e.reviewPeriod} nowSec={nowSec()} />
      </Section>
      <Section title="Settlement details" group>
        <ListRow icon="wallet" title="Client" value={short(e.client)} subtitle={role === 'client' ? 'You' : undefined} />
        <ListRow icon="wallet" title="Provider" value={short(e.provider)} subtitle={role === 'provider' ? 'You' : undefined} />
        <ListRow icon="dispute" title="Arbiter" value={short(e.arbiter)} subtitle={role === 'arbiter' ? 'You' : undefined} />
        <ListRow icon="timer" title="Review window" value={`${Math.round(e.reviewPeriod / 3600)} h`} />
        <ListRow icon="pending" title="Deadline" value={new Date(e.deadline * 1000).toLocaleDateString()} />
      </Section>
      {actions.length === 0 ? (
        <Notice tone="disabled">{role === 'none' ? 'You are not a party to this escrow.' : `No actions available while the escrow is ${e.status.toLowerCase()}.`}</Notice>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {primary && (() => {
            const c = describeAction(primary, e);
            return <Button testID={`escrow-${actionKey(primary)}`} icon="lock" title={`${c.title}${c.amount !== undefined ? ` · ${formatAmount(c.amount, 6)} USDC` : ''}`} onPress={() => go(primary)} />;
          })()}
          {rest.map((a) => {
            const c = describeAction(a, e);
            return <Button key={actionKey(a)} testID={`escrow-${actionKey(a)}`} variant={c.danger ? 'ghost' : 'secondary'} icon={c.danger ? 'warning' : undefined} title={c.title} onPress={() => go(a)} />;
          })}
        </View>
      )}
      <Button variant="ghost" icon="withdraw" title="Withdraw released funds" onPress={() => router.push('/escrow/withdraw')} />
    </Screen>
  );
}
