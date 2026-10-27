import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';

export default function Withdraw() {
  const { service, auth, me } = useEscrow();
  const qc = useQueryClient();
  const credit = useQuery({ queryKey: ['escrow-withdrawable', me], enabled: !!me, queryFn: () => service.withdrawable(ESCROW_CHAIN, me!, ESCROW_USDC) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await service.withdraw(ESCROW_CHAIN, ESCROW_USDC);
      await qc.invalidateQueries({ queryKey: ['escrow-withdrawable'] });
      router.back();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <TestnetBanner />
      <T variant="title">Withdraw from escrow</T>
      <T>Available: {credit.data !== undefined ? formatAmount(credit.data, 6) : '…'} USDC</T>
      {auth.needsPin ? <Input placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} /> : null}
      {error ? <T variant="error">{error}</T> : null}
      <Button title={busy ? 'Withdrawing…' : 'Withdraw USDC'} disabled={!credit.data || busy || !auth.ready} onPress={go} />
    </Screen>
  );
}
