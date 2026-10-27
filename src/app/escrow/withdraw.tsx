import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { EmptyState, ErrorState, LoadingState, Notice, SuccessState } from '@/components/states';
import { Button, Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';

export default function Withdraw() {
  const { service, auth, me } = useEscrow();
  const qc = useQueryClient();
  const credit = useQuery({ queryKey: ['escrow-withdrawable', me], enabled: !!me, queryFn: () => service.withdrawable(ESCROW_CHAIN, me!, ESCROW_USDC) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<bigint | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const amt = credit.data ?? 0n;
    try {
      await service.withdraw(ESCROW_CHAIN, ESCROW_USDC);
      await qc.invalidateQueries({ queryKey: ['escrow-withdrawable'] });
      setDone(amt);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/escrow'));
  if (done !== null)
    return (
      <Screen testID="escrow-withdraw-done">
        <SuccessState title="Withdrawn" body={`${formatAmount(done, 6)} USDC sent to your wallet on Base Sepolia.`}>
          <Button title="Back to escrow" onPress={back} />
        </SuccessState>
      </Screen>
    );
  return (
    <Screen testID="escrow-withdraw">
      <TestnetBanner />
      {credit.isPending && <LoadingState rows={1} label="Checking withdrawable balance" />}
      {credit.isError && <ErrorState error={credit.error} onRetry={() => credit.refetch()} />}
      {credit.data === 0n && <EmptyState icon="withdraw" title="Nothing to withdraw" body="Released milestones and refunds appear here." action={{ label: 'Back to escrow', onPress: back }} />}
      {credit.data ? (
        <>
          <Card>
            <T variant="caption">Available</T>
            <T variant="amount">{formatAmount(credit.data, 6)} USDC</T>
          </Card>
          {auth.needsPin ? <Input testID="escrow-pin" placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} /> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button testID="escrow-withdraw-go" icon="withdraw" title={busy ? 'Withdrawing…' : 'Withdraw USDC'} disabled={busy || !auth.ready} onPress={go} />
        </>
      ) : null}
    </Screen>
  );
}
