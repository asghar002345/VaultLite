import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { gridColumns, useBreakpoint } from '@/components/layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { TokenRow } from '@/components/token-row';
import { Button, Screen } from '@/components/ui';
import { SegmentedPills } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { Layout, Spacing } from '@/constants/theme';
import { useBalances } from '@/hooks/use-balances';
import { useSettings } from '@/store/settings';
import { useAssetQuotes } from '@/hooks/use-asset-quotes';

type Filter = 'all' | ChainKey;
const ALL: Filter[] = ['all', 'sepolia', 'polygonAmoy', 'bscTestnet', 'baseSepolia', 'tronNile', 'solanaDevnet'];
const shortName = (f: Filter) => (f === 'all' ? 'All' : CHAINS[f].name.replace(' Testnet', '').replace(' Sepolia', ' Sep.'));

/** Full asset list (Home shows at most 4 and links here). */
export default function Tokens() {
  const q = useBalances();
  const qc = useQueryClient();
  const { hiddenChains } = useSettings();
  const bp = useBreakpoint();
  const cols = gridColumns(Math.min(bp.width, Layout.maxContentWide));
  const [filter, setFilter] = useState<Filter>('all');
  const filters = ALL.filter((f) => f === 'all' || !hiddenChains.includes(f));
  const active: Filter = filters.includes(filter) ? filter : 'all';
  const rows = useMemo(
    () => (q.data ?? []).filter((x) => !hiddenChains.includes(x.chain) && (active === 'all' || x.chain === active)),
    [q.data, hiddenChains, active],
  );
  const { quotes } = useAssetQuotes(rows);
  return (
    <Screen wide testID="tokens">
      <SegmentedPills items={filters.map((f) => ({ key: f, label: shortName(f) }))} value={active} onChange={setFilter} testID="chain-filter" />
      {q.isPending && <LoadingState rows={6} height={72} label="Loading balances" />}
      {q.isError && <ErrorState title="Couldn't load balances" error={q.error} onRetry={() => q.refetch()} />}
      {q.isSuccess && rows.length === 0 && <EmptyState icon="wallet" title="No tokens here" body="Nothing on this network yet. Import a token by contract address." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {rows.map((item, i) => (
          <View key={`${item.chain}:${item.address}`} style={{ width: cols > 1 ? '49.4%' : '100%' }}>
            <TokenRow item={item} index={i} quote={quotes[`${item.chain}:${item.address}`]} />
          </View>
        ))}
      </View>
      <Button variant="secondary" icon="refresh" title="Refresh balances" onPress={() => qc.invalidateQueries({ queryKey: ['balances'] })} />
      <Button variant="ghost" icon="plus" title="Add custom token" onPress={() => router.push('/tokens/add')} />
    </Screen>
  );
}
