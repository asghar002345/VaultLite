import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { gridColumns, useBreakpoint } from '@/components/layout';
import { EmptyState, ErrorState, ListRow, LoadingState, Section } from '@/components/states';
import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { Layout, Spacing } from '@/constants/theme';
import { formatAmount } from '@/lib/format';
import { roleOf } from '@/modules/escrow';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';
import { MilestoneTrack, StatusPill } from '@/modules/escrow/ui';
import { useMotion } from '@/motion';

export default function EscrowList() {
  const { service, me } = useEscrow();
  const m = useMotion();
  const bp = useBreakpoint();
  const cols = gridColumns(Math.min(bp.width, Layout.maxContentWide));
  const list = useQuery({ queryKey: ['escrows', me], enabled: !!me, queryFn: () => service.listForAccount(ESCROW_CHAIN, me!) });
  const credit = useQuery({ queryKey: ['escrow-withdrawable', me], enabled: !!me, queryFn: () => service.withdrawable(ESCROW_CHAIN, me!, ESCROW_USDC) });
  return (
    <Screen wide testID="escrow-list">
      <TestnetBanner />
      <T variant="caption">Milestone escrow on Base Sepolia · USDC</T>
      <Button title="New escrow" icon="plus" testID="escrow-new" onPress={() => router.push('/escrow/create')} />
      {credit.data ? (
        <ListRow testID="escrow-withdraw" icon="withdraw" title="Withdrawable" value={`${formatAmount(credit.data, 6)} USDC`} subtitle="Released or refunded to you" onPress={() => router.push('/escrow/withdraw')} />
      ) : null}
      <Section title="Your escrows">
        {list.isPending && <LoadingState rows={3} height={120} label="Loading escrows" />}
        {list.isError && <ErrorState title="Couldn't load escrows" error={list.error} onRetry={() => list.refetch()} />}
        {list.data?.length === 0 && (
          <EmptyState icon="escrow" title="No escrows yet" body="Create a milestone escrow to pay a provider in stages, with an arbiter for disputes." action={{ label: 'New escrow', onPress: () => router.push('/escrow/create') }} />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {list.data?.map((e, i) => (
            <Animated.View key={String(e.id)} entering={m.enter(i)} style={{ width: cols > 1 ? '49%' : '100%' }}>
              <Pressable testID={`escrow-item-${e.id}`} onPress={() => router.push({ pathname: '/escrow/[id]', params: { id: String(e.id) } })} accessibilityRole="button" accessibilityLabel={`Escrow ${e.id}, ${e.status}`}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T variant="label">Escrow #{String(e.id)}</T>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <StatusPill status={e.status} />
                      <Icon name="chevron" size="sm" color="textSecondary" />
                    </View>
                  </View>
                  <T variant="amount" style={{ fontSize: 22 }}>{formatAmount(e.total, 6)} USDC</T>
                  <MilestoneTrack milestones={e.milestones} />
                  <T variant="caption">You are the {roleOf(e, me!)} · {e.milestones.length} milestone(s)</T>
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}
