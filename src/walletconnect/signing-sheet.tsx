import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { formatUnits } from 'viem';

import { Button, Card, Input, T } from '@/components/ui';
import { HoldToConfirm } from '@/components/wallet';
import { useReauth } from '@/hooks/use-reauth';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { useTheme } from '@/hooks/use-theme';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { useAllTokens } from '@/store/custom-tokens';
import { useHistory } from '@/store/history';
import { useSession } from '@/vault/session';

import { typedDataTree, type Risk } from './decode';
import { RPC_ERRORS } from './errors';
import { executeRequest, previewEvmTxFee } from './execute';
import { dappTxRecord } from './history';
import type { Analysis } from './requests';
import { respondError, respondResult, type SessionRequest } from './walletkit';

export interface PendingRequest {
  request: SessionRequest;
  analysis: Exclude<Analysis, { kind: 'error' }>;
  peer: { name: string; url: string };
}

const TITLES: Record<string, string> = {
  personal_sign: 'Sign message',
  typed_data: 'Sign typed data',
  send_tx: 'Send transaction',
  tron_sign_message: 'Sign Tron message',
  tron_sign_tx: 'Sign Tron transaction',
};

function RiskList({ risks }: { risks: Risk[] }) {
  const t = useTheme();
  if (!risks.length) return null;
  return (
    <View style={{ gap: 6 }} testID="risk-list">
      {risks.map((r, i) => (
        <View key={i} accessible accessibilityRole="alert" accessibilityLabel={`${r.level}: ${r.text}`} style={[s.risk, { borderColor: r.level === 'danger' ? t.danger : r.level === 'warning' ? t.warning : t.border }]}>
          <T variant={r.level === 'danger' ? 'error' : 'body'}>{r.level === 'danger' ? '⛔ ' : r.level === 'warning' ? '⚠️ ' : 'ℹ️ '}{r.text}</T>
        </View>
      ))}
    </View>
  );
}

function FeePreview({ a }: { a: Extract<PendingRequest['analysis'], { kind: 'send_tx' }> }) {
  const q = useQuery({ queryKey: ['wcFee', a.chain.key, a.tx], queryFn: () => previewEvmTxFee(a), refetchInterval: 15_000 });
  const sym = a.chain.nativeCurrency.symbol;
  return (
    <Card>
      <T variant="caption">Network fee</T>
      {q.isPending && <T variant="caption">Estimating…</T>}
      {q.isError && <T variant="error">Estimate failed: {humanizeError(q.error)} — the transaction will likely fail.</T>}
      {q.data && (
        <>
          <T accessibilityLabel={`Estimated fee ${formatAmount(q.data.expectedCost, 18, 8)} ${sym}`}>≈ {formatAmount(q.data.expectedCost, 18, 8)} {sym}</T>
          <T variant="caption">Max {formatAmount(q.data.maxCost, 18, 8)} {sym} · gas {q.data.gas.toString()}{q.data.dappSetFees ? ' · fees set by dApp' : ''}</T>
        </>
      )}
    </Card>
  );
}

function Body({ a }: { a: PendingRequest['analysis'] }) {
  switch (a.kind) {
    case 'personal_sign':
      return (
        <Card>
          <T variant="caption">{a.display.isHex ? 'Raw hex (not readable text)' : 'Message'}</T>
          <T variant={a.display.isHex ? 'mono' : 'body'} selectable>{a.display.text}</T>
        </Card>
      );
    case 'typed_data': {
      const d = a.typedData.domain ?? {};
      return (
        <Card>
          <T variant="caption">Domain</T>
          <T>{d.name ?? '—'} {d.version ? `v${d.version}` : ''} · chain {String(d.chainId ?? '—')}</T>
          {d.verifyingContract && <T variant="mono" selectable>{d.verifyingContract}</T>}
          <T variant="caption">Primary type: {a.typedData.primaryType}</T>
          {typedDataTree(a.typedData.message).map((n, i) => (
            <T key={i} variant="mono" style={{ paddingLeft: n.depth * 12 }} selectable>
              {n.label}{n.value !== undefined ? `: ${n.value}` : ''}
            </T>
          ))}
        </Card>
      );
    }
    case 'send_tx':
      return (
        <Card>
          <T variant="caption">To</T>
          <T variant="mono" selectable>{a.tx.to}</T>
          <T>Value: {formatUnits(BigInt(a.tx.value ?? '0'), 18)} {a.chain.nativeCurrency.symbol}</T>
          {a.decoded.functionName ? (
            <>
              <T variant="caption">Call: {a.decoded.functionName}</T>
              {a.decoded.args.map((x) => (
                <T key={x.name} variant="mono" selectable>  {x.name}: {x.value}</T>
              ))}
            </>
          ) : a.decoded.selector ? (
            <T variant="mono" selectable>Data: {a.tx.data!.slice(0, 74)}{a.tx.data!.length > 74 ? '…' : ''}</T>
          ) : null}
        </Card>
      );
    case 'tron_sign_message':
      return (
        <Card>
          <T variant="caption">Message</T>
          <T selectable>{a.message}</T>
        </Card>
      );
    case 'tron_sign_tx': {
      const m = a.summary;
      return (
        <Card>
          <T variant="caption">{m.type}</T>
          {m.to && <T variant="mono" selectable>To: {m.to}</T>}
          {m.amountSun && <T>Amount: {formatAmount(BigInt(m.amountSun), 6)} TRX</T>}
          {m.contract && <T variant="mono" selectable>Contract: {m.contract}</T>}
          {a.decoded?.functionName && (
            <>
              <T variant="caption">Call: {a.decoded.functionName}</T>
              {a.decoded.args.map((x) => <T key={x.name} variant="mono">  {x.name}: {x.value}</T>)}
            </>
          )}
          {m.feeLimitSun !== undefined && <T variant="caption">Fee limit: {formatAmount(BigInt(m.feeLimitSun), 6)} TRX</T>}
          <T variant="caption">Signed only — the dApp broadcasts it.</T>
        </Card>
      );
    }
    default:
      return null;
  }
}

export function SigningSheet({ item, onClose }: { item: PendingRequest; onClose: () => void }) {
  useSecureScreen('wc-sign');
  const { withKeys, accounts } = useSession();
  const auth = useReauth();
  const history = useHistory();
  const { tokens } = useAllTokens();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = item.analysis;
  const danger = a.risks.some((r) => r.level === 'danger');

  const reject = async () => {
    await respondError(item.request, RPC_ERRORS.userRejected).catch(() => {});
    onClose();
  };
  const approve = async () => {
    setErr(null);
    const authErr = await auth.verify();
    if (authErr) return setErr(authErr);
    setBusy(true);
    try {
      const result = await withKeys((k) => executeRequest(a, k));
      if (a.kind === 'send_tx' && typeof result === 'string' && accounts) {
        await history.add(
          dappTxRecord(a.chain.key as never, a.chain.nativeCurrency.symbol, a.tx, result, accounts.evm.address, tokens, Date.now(), item.peer.name),
        );
      }
      await respondResult(item.request, result);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      setErr(humanizeError(e));
      await respondError(item.request, { code: RPC_ERRORS.internal.code, message: humanizeError(e) }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={reject}>
      <View style={s.backdrop}>
        <Card>
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 10 }}>
            <T variant="title">{TITLES[a.kind]}</T>
            <T variant="caption">{item.peer.name} · {item.peer.url}</T>
            <T variant="caption">Network: {a.chain.name} (testnet)</T>
            <RiskList risks={a.risks} />
            <Body a={a} />
            {a.kind === 'send_tx' && <FeePreview a={a} />}
            {auth.needsPin && <Input testID="wc-pin" value={auth.pin} onChangeText={auth.setPin} placeholder="PIN to approve" secureTextEntry keyboardType="number-pad" maxLength={6} />}
            {err && <T variant="error">{err}</T>}
          </ScrollView>
          {danger ? (
            <HoldToConfirm label="Hold to approve anyway" disabled={busy || !auth.ready} onConfirm={approve} ms={2500} />
          ) : (
            <Button title={busy ? 'Working…' : 'Approve'} disabled={busy || !auth.ready} onPress={approve} />
          )}
          <Button variant="secondary" title="Reject" disabled={busy} onPress={reject} />
        </Card>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: '#0008' },
  risk: { borderWidth: 1, borderRadius: 8, padding: 8 },
});
