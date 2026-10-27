import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/states';
import { Button, Card, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/vault/session';

import { createRequestDeduper } from './dedupe';
import { presentationFor, requestQueue, useRequestQueue } from './queue';
import { analyzeRequest, verifyRisks } from './requests';
import { SigningSheet } from './signing-sheet';
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

/**
 * Mount while unlocked: inits WalletKit, handles proposals and feeds the request queue.
 * Quick requests (plain messages) open the signing sheet; complex ones (typed data, transactions, Tron tx)
 * open the full /walletconnect/request screen.
 */
export function WalletConnectHost() {
  const { accounts } = useSession();
  const t = useTheme();
  const pathname = usePathname();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const queue = useRequestQueue();
  const [error, setError] = useState<string | null>(null);
  const dedupe = useRef(createRequestDeduper());
  const routed = useRef<number | null>(null);

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
      requestQueue.push({ request: r, analysis: a, peer });
    };
    return subscribe({ onProposal: setProposal, onRequest: (r) => void onRequest(r) });
  }, [accounts]);

  const head = queue[0];
  const headIsScreen = head && presentationFor(head.analysis.kind) === 'screen';
  useEffect(() => {
    if (head && headIsScreen && routed.current !== head.request.id && pathname !== '/walletconnect/request') {
      routed.current = head.request.id;
      router.push({ pathname: '/walletconnect/request', params: { id: String(head.request.id) } });
    }
  }, [head, headIsScreen, pathname]);

  if (head && !headIsScreen) return <SigningSheet key={head.request.id} item={head} onClose={() => requestQueue.remove(head.request.id)} />;
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
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: t.scrim }}>
        <Card raised style={{ width: '100%', maxWidth: Layout.maxContent, alignSelf: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="connect" color="primary" size="lg" />
            <T variant="title" style={{ flex: 1 }}>Connect to {meta.name}?</T>
          </View>
          <T variant="caption">{meta.url}</T>
          {risks.map((r, i) => (
            <Notice key={i} tone={r.level === 'danger' ? 'danger' : r.level === 'warning' ? 'warning' : 'info'}>{r.text}</Notice>
          ))}
          {bad.length > 0 && <Notice tone="danger">Requests unsupported (non-testnet?) chains: {bad.join(', ')}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button
            testID="wc-approve-session"
            title="Approve"
            icon="check"
            disabled={bad.length > 0 || !!proposal.verifyContext?.verified?.isScam}
            onPress={() =>
              approveProposal(proposal, accounts.evm.address, accounts.tron.address)
                .then(close)
                .catch((e) => setError(e.message))
            }
          />
          <Button variant="secondary" title="Reject" icon="close" onPress={() => rejectProposal(proposal).finally(close)} />
        </Card>
      </View>
    </Modal>
  );
}
