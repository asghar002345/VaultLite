import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { availableActions, roleOf, type EscrowAction } from '@/modules/escrow';
import { ESCROW_CHAIN, useEscrow } from '@/modules/escrow/use-escrow';
import { MilestoneTrack, StatusPill } from '@/modules/escrow/ui';
import { SuccessBurst } from '@/components/fx/skia';

const nowSec = () => Math.floor(Date.now() / 1000);
const LABEL: Record<EscrowAction['kind'], string> = {
  fund: 'Fund with USDC', cancel: 'Cancel', dispute: 'Raise dispute', refundExpired: 'Refund (expired)', providerRefund: 'Refund client',
  submit: 'Submit', approve: 'Approve', claim: 'Claim after review',
};

export default function EscrowDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const escrowId = BigInt(id ?? '0');
  const { service, auth, me } = useEscrow();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['escrow', id], queryFn: () => service.getEscrow(ESCROW_CHAIN, escrowId), refetchInterval: 20_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const run = async (a: EscrowAction) => {
    const key = a.kind + ('index' in a ? a.index : '');
    setBusy(key);
    setError(null);
    try {
      const c = ESCROW_CHAIN;
      const r =
        a.kind === 'fund' ? await service.fund(c, escrowId)
        : a.kind === 'cancel' ? await service.cancel(c, escrowId)
        : a.kind === 'dispute' ? await service.raiseDispute(c, escrowId)
        : a.kind === 'refundExpired' ? await service.refundExpired(c, escrowId)
        : a.kind === 'providerRefund' ? await service.providerRefund(c, escrowId)
        : a.kind === 'submit' ? await service.submitMilestone(c, escrowId, a.index)
        : a.kind === 'approve' ? await service.approveMilestone(c, escrowId, a.index)
        : await service.claimAfterReview(c, escrowId, a.index);
      setLastTx(r.hash);
      await qc.invalidateQueries({ queryKey: ['escrow'] });
      await qc.invalidateQueries({ queryKey: ['escrows'] });
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  const e = q.data;
  if (q.isLoading) return <Screen><T>Loading…</T></Screen>;
  if (!e || !me) return <Screen><T variant="error">{q.error ? humanizeError(q.error) : 'Escrow not found'}</T></Screen>;
  const actions = availableActions(e, me, nowSec());
  return (
    <Screen>
      <TestnetBanner />
      <T variant="title">Escrow #{id}</T>
      <StatusPill status={e.status} />
      <MilestoneTrack milestones={e.milestones} />
      <T variant="caption">You are the {roleOf(e, me)} · total {formatAmount(e.total, 6)} USDC · review {Math.round(e.reviewPeriod / 3600)}h</T>
      <T variant="mono">client {e.client}{'\n'}provider {e.provider}{'\n'}arbiter {e.arbiter}</T>
      {e.milestones.map((m) => (
        <Card key={m.index}><T>#{m.index + 1} · {formatAmount(m.amount, 6)} USDC · {m.status}</T></Card>
      ))}
      {auth.needsPin && actions.length ? <Input placeholder="PIN" value={auth.pin} onChangeText={auth.setPin} secureTextEntry keyboardType="number-pad" maxLength={6} /> : null}
      {error ? <T variant="error">{error}</T> : null}
      {lastTx ? <SuccessBurst size={140} /> : null}
      {lastTx ? <T variant="caption">Last tx: {lastTx}</T> : null}
      {actions.map((a) => {
        const key = a.kind + ('index' in a ? a.index : '');
        return (
          <Button key={key} testID={`escrow-${key}`} variant={a.kind === 'dispute' || a.kind === 'cancel' ? 'danger' : 'primary'}
            title={busy === key ? 'Confirm on device…' : LABEL[a.kind] + ('index' in a ? ` milestone ${a.index + 1}` : '')}
            disabled={!!busy || !auth.ready} onPress={() => run(a)} />
        );
      })}
    </Screen>
  );
}
