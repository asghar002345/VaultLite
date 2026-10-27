import { useQueryClient } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Aurora } from '@/components/fx/skia';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { TxRow } from '@/components/tx-row';
import { Button, T, TestnetBanner, usePressScale } from '@/components/ui';
import { SegmentedPills, Skeleton, TokenOrb } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { Fonts, Radius, Spacing, Tabular } from '@/constants/theme';
import { useBalances } from '@/hooks/use-balances';
import { useTheme } from '@/hooks/use-theme';
import { stableTotal } from '@/lib/amount';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { haptic, useMotion } from '@/motion';
import { useHistory } from '@/store/history';
import { useSession } from '@/vault/session';

type Filter = 'all' | ChainKey;
const FILTERS: Filter[] = ['all', 'sepolia', 'polygonAmoy', 'bscTestnet', 'baseSepolia', 'tronNile', 'solanaDevnet'];
const shortName = (f: Filter) => (f === 'all' ? 'All' : CHAINS[f].name.replace(' Testnet', '').replace(' Sepolia', ' Sep.'));

type Row = NonNullable<ReturnType<typeof useBalances>['data']>[number];

function TokenRow({ item, index }: { item: Row; index: number }) {
  const t = useTheme();
  const m = useMotion();
  const press = usePressScale(0.97);
  return (
    <Animated.View entering={m.enter(index)} style={press.style}>
      <Link href={{ pathname: '/token/[chain]/[address]', params: { chain: item.chain, address: item.address } }} asChild>
        <Pressable
          onPressIn={() => {
            haptic.selection();
            press.onPressIn();
          }}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`${item.symbol} on ${CHAINS[item.chain].name}: ${item.balance === null ? 'balance unavailable' : formatAmount(item.balance, item.decimals, 4)}`}
          accessibilityHint="Opens token details"
          // Flattened: on web, Link asChild forwards style straight to <a>, which can't take arrays.
          style={StyleSheet.flatten([s.item, { backgroundColor: t.surface, borderColor: t.border }])}>
          <TokenOrb chain={item.chain} symbol={item.symbol} />
          <View style={s.flex}>
            <T variant="label">{item.symbol}</T>
            <T variant="caption">{CHAINS[item.chain].name}</T>
          </View>
          {item.balance === null ? (
            <T variant="caption">{item.error ? humanizeError(item.error).split('.')[0] : 'RPC error'}</T>
          ) : (
            <T variant="amount">{formatAmount(item.balance, item.decimals, 4)}</T>
          )}
        </Pressable>
      </Link>
    </Animated.View>
  );
}

export default function Home() {
  const t = useTheme();
  const { accounts, lock } = useSession();
  const q = useBalances();
  const history = useHistory(accounts ? { evm: accounts.evm.address, tron: accounts.tron.address } : undefined);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => (q.data ?? []).filter((x) => filter === 'all' || x.chain === filter), [q.data, filter]);
  if (!accounts) return null;
  const total = stableTotal(q.data ?? []);

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: t.background }]} edges={['top']}>
      <FlatList
        data={q.isPending ? [] : rows}
        keyExtractor={(x) => `${x.chain}:${x.address}`}
        contentContainerStyle={s.pad}
        refreshControl={
          <RefreshControl
            tintColor={t.primary}
            refreshing={q.isRefetching}
            onRefresh={() => {
              haptic.light();
              qc.invalidateQueries({ queryKey: ['balances'] });
              qc.invalidateQueries({ queryKey: ['history'] });
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: Spacing.md, marginBottom: Spacing.sm }}>
            <View style={s.topRow}>
              <T style={{ fontFamily: Fonts.display, fontSize: 20, letterSpacing: -0.5 }}>
                vault<T style={{ fontFamily: Fonts.display, fontSize: 20, color: t.primary }}>lite</T>
              </T>
              <T variant="caption">Testnets</T>
            </View>
            <TestnetBanner />
            <View style={[s.hero, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Aurora />
              <T variant="caption" style={{ color: t.text, opacity: 0.75 }}>TOTAL · test stablecoins at $1</T>
              <AnimatedNumber
                testID="total"
                accessibilityLabel={`Total ${total.toFixed(2)} test dollars`}
                value={total}
                prefix="$"
                style={[{ fontFamily: Fonts.display, fontSize: 52, letterSpacing: -2, color: t.text }, Tabular]}
              />
              <T variant="mono" style={{ opacity: 0.7 }}>
                {accounts.evm.address.slice(0, 6)}…{accounts.evm.address.slice(-4)}
              </T>
              <View style={s.row}>
                <View style={s.flex}>
                  <Button title="Send" icon="↗" onPress={() => router.push('/send')} />
                </View>
                <View style={s.flex}>
                  <Button variant="secondary" title="Receive" icon="↙" onPress={() => router.push('/receive')} />
                </View>
              </View>
            </View>
            <SegmentedPills items={FILTERS.map((f) => ({ key: f, label: shortName(f) }))} value={filter} onChange={setFilter} testID="chain-filter" />
            {history.pending.length > 0 && (
              <View testID="pending-list">
                <T variant="caption">PENDING</T>
                {history.pending.map((tx) => (
                  <TxRow key={tx.hash} tx={tx} />
                ))}
              </View>
            )}
            {q.isPending && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} />)}
            {q.isError && <T variant="error">Couldn&apos;t load balances: {humanizeError(q.error)}</T>}
          </View>
        }
        renderItem={({ item, index }) => <TokenRow item={item} index={index} />}
        ListFooterComponent={
          <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Button variant="ghost" title="Add custom token" onPress={() => router.push('/tokens/add')} />
            <Button variant="ghost" title="WalletConnect sessions" disabled={!isReownConfigured()} onPress={() => router.push('/walletconnect')} />
            {!isReownConfigured() && <T variant="caption">WalletConnect disabled: set EXPO_PUBLIC_REOWN_PROJECT_ID (see .env.example).</T>}
            <Button variant="ghost" title="Lock now" onPress={lock} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: 6, overflow: 'hidden', minHeight: 230 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, borderWidth: 1 },
});
