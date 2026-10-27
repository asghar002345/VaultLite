import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import Animated from 'react-native-reanimated';

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
import { useTheme } from '@/hooks/use-theme';
import { alpha, Radius, Spacing } from '@/constants/theme';
import { Icon } from '@/components/icon';
import { ConfirmSheet, EmptyState, ErrorState, LoadingState, Notice, Section } from '@/components/states';
import { SegmentedPills } from '@/components/wallet';
import { groupByDay, matchesFilter, type ActivityFilter } from '@/lib/activity-groups';
import { useMotion } from '@/motion';

const nowMs = () => Date.now();

type Row = { at: number; out?: TxRecord; inc?: IncomingTx; verdict?: SpamVerdict };

function IncomingRow({ tx, verdict }: { tx: IncomingTx; verdict?: SpamVerdict }) {
  const t = useTheme();
  const label = `Received ${formatAmount(BigInt(tx.amount), tx.decimals, 4)} ${tx.symbol}`;
  return (
    <Pressable testID={`in-${tx.id}`} accessibilityRole="link" accessibilityLabel={`${label} on ${CHAINS[tx.chain].name}${verdict && verdict.level !== 'ok' ? `, ${verdict.level}` : ''}`} onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(tx.chain, tx.hash))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(t.primary, 0.13) }}><Icon name="incoming" size="sm" tint={t.primary} /></View>
      <View style={{ flex: 1 }}>
        <T variant="label">{label}</T>
        {verdict?.level === 'unverified' && (
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Icon name="warning" size="sm" tint={t.warning} />
            <T variant="caption">Unverified token</T>
          </View>
        )}
        {verdict?.level === 'spam' && <T variant="error">Likely spam: {verdict.reasons.join(', ')}</T>}
        <T variant="caption">{CHAINS[tx.chain].name} · from {shortAddr(tx.from)} · {new Date(tx.timestamp).toLocaleString()}</T>
      </View>
    </Pressable>
  );
}

export default function Activity() {
  const { accounts } = useSession();
  const m = useMotion();
  const [showHidden, setShowHidden] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>('all');
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
  const unspammed = showHidden ? rows : rows.filter((r) => r.verdict?.level !== 'spam');
  const visible = unspammed.filter((r) => matchesFilter({ at: r.at, direction: r.out ? 'out' : 'in', pending: r.out?.status === 'pending' }, filter));
  const groups = groupByDay(visible, nowMs());

  return (
    <Screen tab testID="activity">
      <T variant="title">Activity</T>
      <SegmentedPills<ActivityFilter> testID="activity-filter" items={[{ key: 'all', label: 'All' }, { key: 'sent', label: 'Sent' }, { key: 'received', label: 'Received' }, { key: 'pending', label: 'Pending' }]} value={filter} onChange={setFilter} />
      {inc.isPending && <LoadingState rows={3} label="Loading incoming transfers" />}
      {inc.isError && <ErrorState title="Couldn't load incoming transfers" error={inc.error} onRetry={() => inc.refetch()} />}
      {inc.data?.errors.map((e) => <Notice key={e} tone="warning">Couldn&apos;t load {e}</Notice>)}
      {hiddenCount > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T variant="caption">Show {hiddenCount} likely-spam transfer{hiddenCount === 1 ? '' : 's'}</T>
          <Switch accessibilityLabel="Show likely spam transfers" value={showHidden} onValueChange={setShowHidden} />
        </View>
      )}
      {visible.length === 0 && !inc.isPending && (
        <EmptyState icon="activity" title={filter === 'all' ? 'No activity yet' : `No ${filter} transfers`} body="Transfers you send or receive on the testnets show up here." />
      )}
      {groups.map((g) => (
        <Section key={g.key} title={g.label} right={<T variant="caption">{g.items.length} {g.items.length === 1 ? 'event' : 'events'}</T>}>
          <View style={{ gap: Spacing.sm }}>
            {g.items.map((r, i) => (
              <Animated.View key={r.out ? r.out.hash : r.inc!.id} entering={m.enter(i)}>
                {r.out ? <TxRow tx={r.out} /> : <IncomingRow tx={r.inc!} verdict={r.verdict} />}
              </Animated.View>
            ))}
          </View>
        </Section>
      ))}
      <Notice>
        Sent: from this device. Received: keyless explorers for {INCOMING_CHAINS.map((c) => CHAINS[c].name).join(', ')} (Amoy and BSC Testnet need explorer API keys, so they aren&apos;t shown).
      </Notice>
      <Button variant="secondary" icon="refresh" title="Refresh" onPress={() => { inc.refetch(); h.refetch(); }} />
      {h.list.length > 0 && <Button variant="ghost" icon="trash" title="Clear local send history" onPress={() => setConfirmClear(true)} />}
      <ConfirmSheet
        visible={confirmClear}
        danger
        title="Clear send history?"
        body="Removes the record of transfers sent from this device. On-chain transactions are not affected."
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => clearHistory().then(() => { setConfirmClear(false); h.refetch(); })}
      />
    </Screen>
  );
}
