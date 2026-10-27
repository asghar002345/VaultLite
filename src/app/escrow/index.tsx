import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { Skeleton } from '@/components/wallet';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { roleOf } from '@/modules/escrow';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';

export default function EscrowList() {
  const { service, me } = useEscrow();
  const list = useQuery({ queryKey: ['escrows', me], enabled: !!me, queryFn: () => service.listForAccount(ESCROW_CHAIN, me!) });
  const credit = useQuery({ queryKey: ['escrow-withdrawable', me], enabled: !!me, queryFn: () => service.withdrawable(ESCROW_CHAIN, me!, ESCROW_USDC) });
  return (
    <Screen>
      <TestnetBanner />
      <T variant="title">My escrows · Base Sepolia</T>
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
      {list.data?.map((e) => (
        <Pressable key={String(e.id)} onPress={() => router.push(`/escrow/${e.id}`)} accessibilityRole="button">
          <Card>
            <View>
              <T>#{String(e.id)} · {e.status} · you are {roleOf(e, me!)}</T>
              <T variant="caption">{formatAmount(e.total, 6)} USDC · {e.milestones.length} milestone(s)</T>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
