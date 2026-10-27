import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { validateAddress } from '@/lib/address';
import { parseAmount } from '@/lib/amount';
import { humanizeError } from '@/lib/errors';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';

const nowSec = () => Math.floor(Date.now() / 1000);

export default function CreateEscrow() {
  const { service, auth } = useEscrow();
  const [provider, setProvider] = useState('');
  const [arbiter, setArbiter] = useState('');
  const [amounts, setAmounts] = useState('');
  const [reviewH, setReviewH] = useState('24');
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = amounts.split(',').map((s) => parseAmount(s.trim(), 6));
  const valid =
    validateAddress('evm', provider).ok && validateAddress('evm', arbiter).ok &&
    parsed.length > 0 && parsed.length <= 50 && parsed.every((a) => a !== null && a > 0n) &&
    Number(reviewH) >= 1 && Number(reviewH) <= 720 && Number(days) >= 1;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await service.createEscrow({
        chain: ESCROW_CHAIN, provider: provider as `0x${string}`, arbiter: arbiter as `0x${string}`, token: ESCROW_USDC,
        amounts: parsed as bigint[], reviewPeriod: Math.round(Number(reviewH) * 3600), deadline: nowSec() + Math.round(Number(days) * 86400),
      });
      router.replace(`/escrow/${r.escrowId}`);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TestnetBanner />
      <T variant="title">New USDC escrow</T>
      <Input placeholder="Provider address 0x…" value={provider} onChangeText={setProvider} autoCapitalize="none" />
      <Input placeholder="Arbiter address 0x…" value={arbiter} onChangeText={setArbiter} autoCapitalize="none" />
      <Input placeholder="Milestones in USDC, comma-separated (e.g. 5, 10)" value={amounts} onChangeText={setAmounts} keyboardType="decimal-pad" />
      <Input placeholder="Review period (hours, 1–720)" value={reviewH} onChangeText={setReviewH} keyboardType="number-pad" />
      <Input placeholder="Deadline (days from now)" value={days} onChangeText={setDays} keyboardType="number-pad" />
      {auth.needsPin ? <Input placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} /> : null}
      {error ? <T variant="error">{error}</T> : null}
      <Button title={busy ? 'Creating…' : 'Create escrow'} testID="escrow-create" disabled={!valid || busy || !auth.ready} onPress={submit} />
    </Screen>
  );
}
