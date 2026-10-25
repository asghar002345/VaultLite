import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';

import { Button, Card, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { useSession } from '@/vault/session';

import { createRequestDeduper } from './dedupe';
import { analyzeRequest, verifyRisks } from './requests';
import { SigningSheet, type PendingRequest } from './signing-sheet';
import {
  approveProposal,
  emitChainChanged,
  getWalletKit,
  rejectProposal,
  respondError,
  respondResult,
  sessionChains,
  subscribe,
  unsupportedChains,
  type Proposal,
  type SessionRequest,
} from './walletkit';

/** Mount while unlocked: inits WalletKit, handles proposals and routes requests to the signing sheet. */
export function WalletConnectHost() {
  const { accounts } = useSession();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dedupe = useRef(createRequestDeduper());

  useEffect(() => {
    if (!isReownConfigured() || !accounts) return;
    getWalletKit().catch((e) => console.warn('[walletkit] init failed', e?.message));
    const onRequest = async (r: SessionRequest) => {
      const kit = await getWalletKit();
      const session = kit.getActiveSessions()[r.topic];
      const { method, params } = r.params.request;
      // Ignore redelivered ids and identical payloads fired twice within 5 s (no response: the first one answers).
      if (dedupe.current({ id: r.id, topic: r.topic, method, params, chainId: r.params.chainId })) return;
      const a = analyzeRequest({
        method,
        params,
        chainId: r.params.chainId,
        sessionChains: sessionChains(r.topic, r.params.chainId),
        evmAddress: accounts.evm.address,
        tronAddress: accounts.tron.address,
        verify: r.verifyContext?.verified,
      });
      if (a.kind === 'error') return respondError(r, a.error).catch(() => {});
      if (a.kind === 'switch_chain') {
        await respondResult(r, null).catch(() => {});
        return emitChainChanged(r.topic, a.target.caip2, a.target.chainId!).catch(() => {});
      }
      const peer = { name: session?.peer.metadata.name ?? 'Unknown dApp', url: session?.peer.metadata.url ?? '' };
      setQueue((q) => [...q, { request: r, analysis: a, peer }]);
    };
    return subscribe({ onProposal: setProposal, onRequest: (r) => void onRequest(r) });
  }, [accounts]);

  if (queue[0]) return <SigningSheet key={queue[0].request.id} item={queue[0]} onClose={() => setQueue((q) => q.slice(1))} />;
  if (!proposal || !accounts) return null;
  const meta = proposal.params.proposer.metadata;
  const bad = unsupportedChains(proposal.params, CHAIN_LIST.filter((c) => c.family !== 'solana').map((c) => c.caip2));
  const risks = verifyRisks(proposal.verifyContext?.verified);
  const close = () => {
    setProposal(null);
    setError(null);
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={() => rejectProposal(proposal).finally(close)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: '#0008' }}>
        <Card>
          <T variant="title">Connect to {meta.name}?</T>
          <T variant="caption">{meta.url}</T>
          {risks.map((r, i) => <T key={i} variant={r.level === 'danger' ? 'error' : 'caption'}>{r.level === 'danger' ? '⛔' : '⚠️'} {r.text}</T>)}
          {bad.length > 0 && <T variant="error">Requests unsupported (non-testnet?) chains: {bad.join(', ')}</T>}
          {error && <T variant="error">{error}</T>}
          <Button
            title="Approve"
            disabled={bad.length > 0 || !!proposal.verifyContext?.verified?.isScam}
            onPress={() =>
              approveProposal(proposal, accounts.evm.address, accounts.tron.address)
                .then(close)
                .catch((e) => setError(e.message))
            }
          />
          <Button variant="secondary" title="Reject" onPress={() => rejectProposal(proposal).finally(close)} />
        </Card>
      </View>
    </Modal>
  );
}
