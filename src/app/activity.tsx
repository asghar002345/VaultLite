import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { TxRow } from '@/components/tx-row';
import { CHAINS } from '@/config/chains';
import { formatAmount, shortAddr } from '@/lib/format';
import { classifyIncoming, type SpamVerdict } from '@/lib/spam';
import { useAllTokens } from '@/store/custom-tokens';
import { explorerTxUrl } from '@/services/evm';
import { fetchIncoming, INCOMING_CHAINS, type IncomingTx } from '@/services/incoming';
import { clearHistory, useHistory } from '@/store/history';
import type { TxRecord } from '@/store/history-core';
import { useSession } from '@/vault/session';

type Row = { at: number; out?: TxRecord; inc?: IncomingTx; verdict?: SpamVerdict };

function IncomingRow({ tx, verdict }: { tx: IncomingTx; verdict?: SpamVerdict }) {
  const label = `Received ${formatAmount(BigInt(tx.amount), tx.decimals, 4)} ${tx.symbol}`;
  return (
    <Pressable testID={`in-${tx.id}`} accessibilityRole="link" accessibilityLabel={`${label} on ${CHAINS[tx.chain].name}${verdict && verdict.level !== 'ok' ? `, ${verdict.level}` : ''}`} onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(tx.chain, tx.hash))} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
      <T style={{ width: 24 }}>↓</T>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {verdict?.level === 'unverified' && <T variant="caption">⚠️ Unverified token</T>}
        {verdict?.level === 'spam' && <T variant="error">Likely spam: {verdict.reasons.join(', ')}</T>}
        <T variant="caption">{CHAINS[tx.chain].name} · from {shortAddr(tx.from)} · {new Date(tx.timestamp).toLocaleString()}</T>
      </View>
    </Pressable>
  );
}

export default function Activity() {
  const { accounts } = useSession();
  const [showHidden, setShowHidden] = useState(false);
  const { tokens } = useAllTokens();
  const h = useHistory(accounts ? { evm: accounts.evm.address, tron: accounts.tron.address } : undefined);
  const inc = useQuery({
    queryKey: ['incoming', accounts?.evm.address, accounts?.tron.address],
    enabled: !!accounts,
    staleTime: 60_000,
    queryFn: () => fetchIncoming(accounts!.evm.address, accounts!.tron.address),
  });
  const rows: Row[] = [
    ...h.list.map((t) => ({ at: t.createdAt, out: t })),
    ...(inc.data?.items ?? []).map((t) => ({ at: t.timestamp, inc: t, verdict: classifyIncoming(t, tokens) })),
  ].sort((a, b) => b.at - a.at);
  const hiddenCount = rows.filter((r) => r.verdict?.level === 'spam').length;
  const visible = showHidden ? rows : rows.filter((r) => r.verdict?.level !== 'spam');

  return (
    <Screen>
      <T variant="caption">
        Sent: from this device. Received: keyless explorers for {INCOMING_CHAINS.map((c) => CHAINS[c].name).join(', ')} (Amoy and BSC Testnet need explorer API keys, so they aren&apos;t shown).
      </T>
      {inc.isPending && <T variant="caption">Loading incoming transfers…</T>}
      {inc.data?.errors.map((e) => <T key={e} variant="caption">Couldn&apos;t load {e}</T>)}
      {hiddenCount > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T variant="caption">Show {hiddenCount} likely-spam transfer{hiddenCount === 1 ? '' : 's'}</T>
          <Switch accessibilityLabel="Show likely spam transfers" value={showHidden} onValueChange={setShowHidden} />
        </View>
      )}
      {visible.length === 0 && !inc.isPending && <T variant="caption">No activity yet.</T>}
      {visible.map((r) => (r.out ? <TxRow key={r.out.hash} tx={r.out} /> : <IncomingRow key={r.inc!.id} tx={r.inc!} verdict={r.verdict} />))}
      <Button variant="secondary" title="Refresh" onPress={() => { inc.refetch(); h.refetch(); }} />
      {h.list.length > 0 && <Button variant="secondary" title="Clear local send history" onPress={() => clearHistory().then(() => h.refetch())} />}
    </Screen>
  );
}
