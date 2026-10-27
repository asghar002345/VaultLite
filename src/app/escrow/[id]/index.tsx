import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, ListRow, LoadingState, Notice, Section } from '@/components/states';
import { Card, Screen, T, TestnetBanner } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import { actionKey, availableActions, describeAction, roleOf } from '@/modules/escrow';
import { ESCROW_CHAIN, useEscrow } from '@/modules/escrow/use-escrow';
import { MilestoneTrack, StatusPill } from '@/modules/escrow/ui';

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
  return (
    <Screen testID="escrow-detail">
      <Stack.Screen options={{ title: `Escrow #${id}` }} />
      <TestnetBanner />
      <Card>
        <StatusPill status={e.status} />
        <T variant="title">{formatAmount(e.total, 6)} USDC</T>
        <T variant="caption">You are the {role} · review period {Math.round(e.reviewPeriod / 3600)} h · deadline {new Date(e.deadline * 1000).toLocaleDateString()}</T>
        <MilestoneTrack milestones={e.milestones} />
      </Card>
      <Section title="Parties">
        <ListRow icon="wallet" title="Client" value={short(e.client)} subtitle={role === 'client' ? 'You' : undefined} />
        <ListRow icon="wallet" title="Provider" value={short(e.provider)} subtitle={role === 'provider' ? 'You' : undefined} />
        <ListRow icon="dispute" title="Arbiter" value={short(e.arbiter)} subtitle={role === 'arbiter' ? 'You' : undefined} />
      </Section>
      <Section title="Milestones">
        {e.milestones.map((m) => (
          <ListRow key={m.index} icon={m.status === 'Released' ? 'success' : m.status === 'Submitted' ? 'pending' : m.status === 'Pending' ? 'timer' : 'undo'} title={`Milestone ${m.index + 1}`} value={`${formatAmount(m.amount, 6)} USDC`} subtitle={m.status} />
        ))}
      </Section>
      <Section title="Actions">
        {actions.length === 0 ? (
          <Notice tone="disabled">{role === 'none' ? 'You are not a party to this escrow.' : `No actions available while the escrow is ${e.status.toLowerCase()}.`}</Notice>
        ) : (
          actions.map((a) => {
            const c = describeAction(a, e);
            return (
              <ListRow key={actionKey(a)} testID={`escrow-${actionKey(a)}`} icon={c.danger ? 'warning' : 'chevron'} danger={c.danger} title={c.title}
                subtitle={c.amount !== undefined ? `${formatAmount(c.amount, 6)} USDC` : undefined}
                onPress={() => router.push({ pathname: '/escrow/[id]/action', params: { id: id!, a: actionKey(a) } })} />
            );
          })
        )}
        <ListRow icon="withdraw" title="Withdraw released funds" onPress={() => router.push('/escrow/withdraw')} />
      </Section>
    </Screen>
  );
}
