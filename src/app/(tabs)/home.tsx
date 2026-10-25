import { useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, T, TestnetBanner } from '@/components/ui';
import { Chip, Skeleton } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { Spacing } from '@/constants/theme';
import { TxRow } from '@/components/tx-row';
import { useBalances } from '@/hooks/use-balances';
import { humanizeError } from '@/lib/errors';
import { useHistory } from '@/store/history';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount } from '@/lib/format';
import { stableTotal } from '@/lib/amount';
import { useSession } from '@/vault/session';

type Filter = 'all' | ChainKey;
const FILTERS: Filter[] = ['all', 'sepolia', 'polygonAmoy', 'bscTestnet', 'baseSepolia', 'tronNile', 'solanaDevnet'];

export default function Home() {
  const t = useTheme();
  const { accounts, lock } = useSession();
  const q = useBalances();
  const history = useHistory(accounts ? { evm: accounts.evm.address, tron: accounts.tron.address } : undefined);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => (q.data ?? []).filter((x) => filter === 'all' || x.chain === filter), [q.data, filter]);
  if (!accounts) return null;

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: t.background }]}>
      <FlatList
        data={q.isPending ? [] : rows}
        keyExtractor={(x) => `${x.chain}:${x.address}`}
        contentContainerStyle={s.pad}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => {
              qc.invalidateQueries({ queryKey: ['balances'] });
              qc.invalidateQueries({ queryKey: ['history'] });
            }} />
        }
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
            <TestnetBanner />
            <T variant="caption">Total (test stablecoins at $1; native tokens unpriced)</T>
            <T variant="hero" testID="total" accessibilityLabel={`Total ${stableTotal(q.data ?? []).toFixed(2)} test dollars`}>${stableTotal(q.data ?? []).toFixed(2)}</T>
            <View style={s.row}>
              <View style={s.flex}><Button title="Send" onPress={() => router.push('/send')} /></View>
              <View style={s.flex}><Button variant="secondary" title="Receive" onPress={() => router.push('/receive')} /></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
              {FILTERS.map((f) => (
                <Chip key={f} label={f === 'all' ? 'All' : CHAINS[f].name.replace(' Testnet', '')} active={filter === f} onPress={() => setFilter(f)} />
              ))}
            </ScrollView>
            {history.pending.length > 0 && (
              <View testID="pending-list">
                <T variant="caption">Pending</T>
                {history.pending.map((tx) => <TxRow key={tx.hash} tx={tx} />)}
              </View>
            )}
            {q.isPending && [0, 1, 2, 3].map((i) => <Skeleton key={i} />)}
            {q.isError && <T variant="error">Couldn&apos;t load balances: {humanizeError(q.error)}</T>}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()}>
          <Link href={{ pathname: '/token/[chain]/[address]', params: { chain: item.chain, address: item.address } }} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.symbol} on ${CHAINS[item.chain].name}: ${item.balance === null ? 'balance unavailable' : formatAmount(item.balance, item.decimals, 4)}`}
              accessibilityHint="Opens token details"
              style={[s.item, { borderColor: t.border }]}>
              <View style={s.flex}>
                <T style={{ fontWeight: '600' }}>{item.symbol}</T>
                <T variant="caption">{CHAINS[item.chain].name}</T>
              </View>
              {item.balance === null ? (
                <T variant="caption">{item.error ? humanizeError(item.error).split('.')[0] : 'RPC error'}</T>
              ) : (
                <T>{formatAmount(item.balance, item.decimals, 4)}</T>
              )}
            </Pressable>
          </Link>
          </Animated.View>
        )}
        ListFooterComponent={
          <View style={{ gap: Spacing.md, marginTop: Spacing.lg }}>
            <Button variant="secondary" title="Add custom token" onPress={() => router.push('/tokens/add')} />
            <Button variant="secondary" title={`Activity${history.list.length ? ` (${history.list.length})` : ''}`} onPress={() => router.push('/activity')} />
            <Button variant="secondary" title="WalletConnect sessions" disabled={!isReownConfigured()} onPress={() => router.push('/walletconnect')} />
            {!isReownConfigured() && <T variant="caption">WalletConnect disabled: set EXPO_PUBLIC_REOWN_PROJECT_ID (see .env.example).</T>}
            <Button variant="secondary" title="Lock now" onPress={lock} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.lg, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
