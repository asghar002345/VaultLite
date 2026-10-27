import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SuccessBurst } from '@/components/fx/skia';
import { EmptyState, ErrorState, LoadingState, Notice, Section, SuccessState } from '@/components/states';
import { Button, Card, Input, Screen, T } from '@/components/ui';
import { HoldToConfirm } from '@/components/wallet';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { availableActions, describeAction, parseActionKey, type EscrowAction } from '@/modules/escrow';
import { ESCROW_CHAIN, useEscrow } from '@/modules/escrow/use-escrow';
import { explorerTxUrl } from '@/services/evm';

type Step = { k: 'summary' } | { k: 'confirm' } | { k: 'sending' } | { k: 'done'; hash: string } | { k: 'failed'; msg: string };
const nowSec = () => Math.floor(Date.now() / 1000);
const STEPS = ['Review', 'Confirm', 'Result'];
const stepIndex = (s: Step) => (s.k === 'summary' ? 0 : s.k === 'confirm' || s.k === 'sending' ? 1 : 2);

function StepDots({ at }: { at: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Step ${at + 1} of 3: ${STEPS[at]}`}>
      {STEPS.map((l, i) => (
        <T key={l} variant="caption" style={{ opacity: i === at ? 1 : 0.45 }}>{i + 1}. {l}</T>
      ))}
    </View>
  );
}

export default function EscrowActionScreen() {
  const { id, a: key } = useLocalSearchParams<{ id: string; a: string }>();
  const action = parseActionKey(key);
  const { service, auth, me } = useEscrow();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['escrow', id], queryFn: () => service.getEscrow(ESCROW_CHAIN, BigInt(id!)), enabled: !!action && /^\d+$/.test(id ?? '') });
  const [step, setStep] = useState<Step>({ k: 'summary' });
  const back = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/escrow/[id]', params: { id: id! } });

  if (!action) return <Screen><EmptyState icon="escrow" title="Unknown action" action={{ label: 'Back to escrow', onPress: back }} /></Screen>;
  if (q.isPending) return <Screen><LoadingState rows={3} /></Screen>;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const e = q.data;
  if (!e || !me) return <Screen><EmptyState icon="escrow" title="Escrow not found" action={{ label: 'All escrows', onPress: () => router.replace('/escrow') }} /></Screen>;
  const copy = describeAction(action, e);
  const stillAllowed = availableActions(e, me, nowSec()).some((x) => JSON.stringify(x) === JSON.stringify(action));

  const run = async (a: EscrowAction) => {
    setStep({ k: 'sending' });
    try {
      const c = ESCROW_CHAIN, i = BigInt(id!);
      const r =
        a.kind === 'fund' ? await service.fund(c, i)
        : a.kind === 'cancel' ? await service.cancel(c, i)
        : a.kind === 'dispute' ? await service.raiseDispute(c, i)
        : a.kind === 'refundExpired' ? await service.refundExpired(c, i)
        : a.kind === 'providerRefund' ? await service.providerRefund(c, i)
        : a.kind === 'submit' ? await service.submitMilestone(c, i, a.index)
        : a.kind === 'approve' ? await service.approveMilestone(c, i, a.index)
        : await service.claimAfterReview(c, i, a.index);
      await qc.invalidateQueries({ queryKey: ['escrow'] });
      await qc.invalidateQueries({ queryKey: ['escrows'] });
      setStep({ k: 'done', hash: r.hash });
    } catch (err) {
      setStep({ k: 'failed', msg: humanizeError(err) });
    }
  };

  return (
    <Screen testID={`escrow-action-${step.k}`}>
      <Stack.Screen options={{ title: copy.title, gestureEnabled: step.k !== 'sending' }} />
      <StepDots at={stepIndex(step)} />
      {step.k === 'summary' && (
        <>
          <Card>
            <T variant="title">{copy.title}</T>
            {copy.amount !== undefined && <T variant="amount">{formatAmount(copy.amount, 6)} USDC</T>}
            <T>{copy.body}</T>
          </Card>
          <Section title="What happens">
            {copy.effects.map((x) => <T key={x} variant="caption">• {x}</T>)}
          </Section>
          {copy.danger && <Notice tone="warning">This changes the escrow for every party. Double-check before continuing.</Notice>}
          {!stillAllowed && <Notice tone="disabled">This action is no longer available (the escrow changed). Go back to see current actions.</Notice>}
          <Button testID="escrow-action-continue" title="Continue" icon="chevron" disabled={!stillAllowed} onPress={() => setStep({ k: 'confirm' })} />
          <Button variant="ghost" title="Back" onPress={back} />
        </>
      )}
      {(step.k === 'confirm' || step.k === 'sending') && (
        <>
          <Card>
            <T variant="label">{copy.verb} · escrow #{id}</T>
            {copy.amount !== undefined && <T variant="caption">{formatAmount(copy.amount, 6)} USDC · Base Sepolia (testnet)</T>}
          </Card>
          {auth.needsPin && <Input testID="escrow-pin" placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} />}
          {!auth.ready && <Notice tone="disabled">Enter your PIN to confirm.</Notice>}
          {step.k === 'sending' && <LoadingState rows={1} label="Waiting for confirmation on Base Sepolia…" />}
          {copy.danger ? (
            <HoldToConfirm label={`Hold to ${copy.verb.toLowerCase()}`} disabled={step.k === 'sending' || !auth.ready} onConfirm={() => run(action)} ms={2000} />
          ) : (
            <Button testID="escrow-action-confirm" title={step.k === 'sending' ? 'Confirming…' : copy.verb} disabled={step.k === 'sending' || !auth.ready} onPress={() => run(action)} />
          )}
          <Button variant="ghost" title="Back" disabled={step.k === 'sending'} onPress={() => setStep({ k: 'summary' })} />
        </>
      )}
      {step.k === 'done' && (
        <>
          <SuccessBurst size={140} />
          <SuccessState title="Done" body={`${copy.title} confirmed on Base Sepolia.`}>
            <T variant="mono" selectable>{step.hash}</T>
            <Button variant="secondary" icon="external" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(ESCROW_CHAIN, step.hash))} />
            <Button testID="escrow-action-back" title="Back to escrow" onPress={back} />
          </SuccessState>
        </>
      )}
      {step.k === 'failed' && (
        <>
          <ErrorState title={`${copy.title} failed`} error={step.msg} onRetry={() => setStep({ k: 'confirm' })} />
          <Button variant="ghost" title="Back to escrow" onPress={back} />
        </>
      )}
    </Screen>
  );
}
