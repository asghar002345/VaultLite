import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ListRow, Notice, Section } from '@/components/states';
import { Button, Card, T, TestnetBanner } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { Layout, Radius, Spacing } from '@/constants/theme';
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
  const ns = { ...(proposal.params.requiredNamespaces ?? {}), ...(proposal.params.optionalNamespaces ?? {}) };
  const methods = [...new Set(Object.values(ns).flatMap((n) => n.methods ?? []))];
  const chains = [...new Set(Object.values(ns).flatMap((n) => n.chains ?? []))];
  const scopes = [
    { ok: true, title: 'See your addresses', sub: 'Your EVM and Tron testnet accounts are shared with the dApp' },
    methods.some((x) => /sendTransaction|signTransaction/.test(x)) && { ok: true, title: 'Request transactions', sub: 'Every transaction needs your approval here' },
    methods.some((x) => /sign/.test(x) && !/Transaction/.test(x)) && { ok: true, title: 'Request signatures', sub: 'Messages and typed data (EIP-712), each approved by you' },
  ].filter(Boolean) as { ok: boolean; title: string; sub: string }[];
  const verified = proposal.verifyContext?.verified;
  const short = (x: string) => `${x.slice(0, 6)}…${x.slice(-4)}`;
  return (
    <Modal transparent animationType="slide" onRequestClose={() => rejectProposal(proposal).finally(close)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: Spacing.sm, backgroundColor: t.scrim }}>
        <Card raised style={{ width: '100%', maxWidth: Layout.maxContent, alignSelf: 'center', gap: Spacing.lg, padding: Spacing.lg }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: t.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T variant="title">Connect request</T>
            <TestnetBanner />
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: Radius.md, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="connect" color="primary" />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="headline">{meta.name}</T>
              <T variant="mono" style={{ color: t.textSecondary }}>{meta.url.replace(/^https?:\/\//, '')}</T>
            </View>
            {verified?.validation === 'VALID' ? <T variant="overline" style={{ color: t.primary }}>Domain verified</T> : null}
          </View>
          <Section group>
            <ListRow icon="wallet" title="Account" value={short(accounts.evm.address)} />
            <ListRow icon="network" title="Networks" subtitle={chains.map((c) => CHAIN_LIST.find((x) => x.caip2 === c)?.name ?? c).join(', ') || '—'} />
          </Section>
          <Section title="This dApp will be able to">
            {scopes.map((x) => (
              <View key={x.title} style={{ flexDirection: 'row', gap: Spacing.smd }}>
                <Icon name="check" size="sm" color="primary" />
                <View style={{ flex: 1 }}>
                  <T variant="label">{x.title}</T>
                  <T variant="caption">{x.sub}</T>
                </View>
              </View>
            ))}
          </Section>
          {risks.map((r, i) => (
            <Notice key={i} tone={r.level === 'danger' ? 'danger' : r.level === 'warning' ? 'warning' : 'info'}>{r.text}</Notice>
          ))}
          {bad.length > 0 && <Notice tone="danger">Requests unsupported (non-testnet?) chains: {bad.join(', ')}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <View style={{ flexDirection: 'row', gap: Spacing.smd }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" title="Reject" onPress={() => rejectProposal(proposal).finally(close)} />
            </View>
            <View style={{ flex: 1.6 }}>
              <Button
                testID="wc-approve-session"
                title="Approve"
                icon="shield"
                disabled={bad.length > 0 || !!proposal.verifyContext?.verified?.isScam}
                onPress={() =>
                  approveProposal(proposal, accounts.evm.address, accounts.tron.address)
                    .then(close)
                    .catch((e) => setError(e.message))
                }
              />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
