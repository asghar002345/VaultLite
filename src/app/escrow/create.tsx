import { router } from 'expo-router';
import { useState } from 'react';

import { Field, ListRow, Notice, Section } from '@/components/states';
import { Button, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { validateAddress } from '@/lib/address';
import { parseAmount } from '@/lib/amount';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { ESCROW_CHAIN, ESCROW_USDC, useEscrow } from '@/modules/escrow/use-escrow';

const nowSec = () => Math.floor(Date.now() / 1000);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function CreateEscrow() {
  const { service, auth, me } = useEscrow();
  const [provider, setProvider] = useState('');
  const [arbiter, setArbiter] = useState('');
  const [amounts, setAmounts] = useState('');
  const [reviewH, setReviewH] = useState('24');
  const [days, setDays] = useState('14');
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = amounts.split(',').map((s) => parseAmount(s.trim(), 6));
  const provOk = validateAddress('evm', provider).ok;
  const arbOk = validateAddress('evm', arbiter).ok;
  const amountsOk = parsed.length > 0 && parsed.length <= 50 && parsed.every((a) => a !== null && a > 0n);
  const reviewOk = Number(reviewH) >= 1 && Number(reviewH) <= 720;
  const daysOk = Number(days) >= 1 && Number(days) <= 365;
  const self = me?.toLowerCase();
  const roleClash = !!self && (provider.toLowerCase() === self || arbiter.toLowerCase() === self);
  const valid = provOk && arbOk && amountsOk && reviewOk && daysOk && !roleClash;
  const total = amountsOk ? (parsed as bigint[]).reduce((a, b) => a + b, 0n) : 0n;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await service.createEscrow({
        chain: ESCROW_CHAIN, provider: provider as `0x${string}`, arbiter: arbiter as `0x${string}`, token: ESCROW_USDC,
        amounts: parsed as bigint[], reviewPeriod: Math.round(Number(reviewH) * 3600), deadline: nowSec() + Math.round(Number(days) * 86400),
      });
      router.replace({ pathname: '/escrow/[id]', params: { id: String(r.escrowId) } });
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'review')
    return (
      <Screen testID="escrow-create-review">
        <T variant="title">Review escrow</T>
        <Section title="Summary" group>
          <ListRow icon="currency" title="Total" value={`${formatAmount(total, 6)} USDC`} subtitle={`${parsed.length} milestone(s): ${(parsed as bigint[]).map((a) => formatAmount(a, 6)).join(' · ')}`} />
          <ListRow icon="wallet" title="Provider" value={short(provider)} />
          <ListRow icon="dispute" title="Arbiter" value={short(arbiter)} />
          <ListRow icon="timer" title="Review period" value={`${reviewH} h`} />
          <ListRow icon="pending" title="Deadline" value={`${days} days`} />
        </Section>
        <Notice>Creating does not move funds. You fund it from the escrow screen in a separate step.</Notice>
        {auth.needsPin ? <Input testID="escrow-pin" placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} /> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {busy && <Notice>Creating on Base Sepolia… this takes a few seconds.</Notice>}
        <Button title={busy ? 'Creating…' : 'Create escrow'} icon="check" testID="escrow-create" loading={busy} disabled={!auth.ready} onPress={submit} />
        <Button variant="ghost" title="Edit" disabled={busy} onPress={() => setStep('form')} />
      </Screen>
    );

  return (
    <Screen testID="escrow-create-form">
      <TestnetBanner />
      <T variant="title">New USDC escrow</T>
      <Field label="Provider" helper="Who delivers the work and gets paid" error={provider && !provOk ? 'Not a valid EVM address' : provider.toLowerCase() === self ? 'You cannot be the provider' : null}>
        <Input testID="escrow-provider" placeholder="0x…" value={provider} onChangeText={setProvider} autoCapitalize="none" autoCorrect={false} />
      </Field>
      <Field label="Arbiter" helper="Resolves disputes" error={arbiter && !arbOk ? 'Not a valid EVM address' : arbiter.toLowerCase() === self ? 'You cannot be the arbiter' : null}>
        <Input testID="escrow-arbiter" placeholder="0x…" value={arbiter} onChangeText={setArbiter} autoCapitalize="none" autoCorrect={false} />
      </Field>
      <Field label="Milestones (USDC)" helper="Comma-separated, e.g. 5, 10 (max 50)" error={amounts && !amountsOk ? 'Each milestone must be a positive amount' : null}>
        <Input testID="escrow-amounts" placeholder="5, 10" value={amounts} onChangeText={setAmounts} keyboardType="decimal-pad" />
      </Field>
      <Field label="Review period (hours)" helper="1–720" error={!reviewOk ? 'Must be 1–720 hours' : null}>
        <Input value={reviewH} onChangeText={setReviewH} keyboardType="number-pad" />
      </Field>
      <Field label="Deadline (days from now)" helper="After this the client can refund unreleased milestones" error={!daysOk ? 'Must be 1–365 days' : null}>
        <Input value={days} onChangeText={setDays} keyboardType="number-pad" />
      </Field>
      {!valid && <Notice tone="disabled">Fill in every field to continue.</Notice>}
      <Button title="Review" icon="chevron" testID="escrow-review" disabled={!valid} onPress={() => setStep('review')} />
    </Screen>
  );
}
