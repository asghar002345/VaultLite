import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { Skeleton } from '@/components/wallet';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { roleOf } from '@/modules/escrow';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';
import { StatusPill, MilestoneTrack } from '@/modules/escrow/ui';
import { useMotion } from '@/motion';

export default function EscrowList() {
  const { service, me } = useEscrow();
  const m = useMotion();
  const list = useQuery({ queryKey: ['escrows', me], enabled: !!me, queryFn: () => service.listForAccount(ESCROW_CHAIN, me!) });
  const credit = useQuery({ queryKey: ['escrow-withdrawable', me], enabled: !!me, queryFn: () => service.withdrawable(ESCROW_CHAIN, me!, ESCROW_USDC) });
  return (
    <Screen tab>
      <TestnetBanner />
      <T variant="title">Escrow</T>
      <T variant="caption">Milestone escrow on Base Sepolia · USDC</T>
      <Button title="New escrow" testID="escrow-new" onPress={() => router.push('/escrow/create')} />
      {credit.data ? (
        <Card>
          <T>Withdrawable: {formatAmount(credit.data, 6)} USDC</T>
          <Button title="Withdraw" variant="secondary" testID="escrow-withdraw" onPress={() => router.push('/escrow/withdraw')} />
        </Card>
      ) : null}
      {list.isLoading ? <Skeleton /> : null}
      {list.error ? <T variant="error">{humanizeError(list.error)}</T> : null}
      {list.data?.length === 0 ? <T variant="caption">No escrows yet.</T> : null}
      {list.data?.map((e, i) => (
        <Animated.View key={String(e.id)} entering={m.enter(i)}>
          <Pressable onPress={() => router.push(`/escrow/${e.id}`)} accessibilityRole="button">
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T variant="label">Escrow #{String(e.id)}</T>
                <StatusPill status={e.status} />
              </View>
              <T variant="amount" style={{ fontSize: 22 }}>{formatAmount(e.total, 6)} USDC</T>
              <MilestoneTrack milestones={e.milestones} />
              <T variant="caption">You are the {roleOf(e, me!)} · {e.milestones.length} milestone(s)</T>
            </Card>
          </Pressable>
        </Animated.View>
      ))}
    </Screen>
  );
}
