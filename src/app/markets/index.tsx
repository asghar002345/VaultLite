import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FreshnessLabel, MarketRow, REFERENCE_LABEL } from '@/components/market';
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/states';
import { Input, Screen, T } from '@/components/ui';
import { SegmentedPills } from '@/components/wallet';
import { HitTarget, Spacing } from '@/constants/theme';
import { useTickers } from '@/hooks/use-market';
import { useTheme } from '@/hooks/use-theme';
import { useOffline } from '@/services/market/offline';
import { applyMarketQuery, type MarketCategory, type SortDir, type SortKey } from '@/services/market/filters';
import { freshnessOf } from '@/services/market/stale';
import { MARKET_UNIVERSE } from '@/services/market/symbols';
import { toggleFav, useFavorites } from '@/store/favorites';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'price', label: 'Price' },
  { key: 'change', label: '24h %' },
];

/** Markets: Binance spot USDT pairs (mainnet reference). Search, category, sort, favorites. */
export default function Markets() {
  const t = useTheme();
  const offlineNow = useOffline();
  const favorites = useFavorites();
  const m = useTickers(MARKET_UNIVERSE);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MarketCategory>('all');
  const [sort, setSort] = useState<SortKey>('volume');
  const [dir, setDir] = useState<SortDir>('desc');
  const list = useMemo(
    () => applyMarketQuery(m.valid.map((s) => m.tickers[s]).filter(Boolean), { search, category, sort, dir, favorites }),
    [m.valid, m.tickers, search, category, sort, dir, favorites],
  );
  const newest = Math.max(0, ...m.valid.map((s) => m.tickers[s]?.receivedAt ?? 0));
  const offline = offlineNow;
  const loading = (m.info.isPending || m.rest.isPending) && list.length === 0 && category !== 'favorites';
  const error: unknown = list.length ? null : (m.info.error ?? m.rest.error ?? null);

  const pickSort = (k: SortKey) => {
    if (k === sort) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSort(k);
      setDir('desc');
    }
  };

  return (
    <Screen testID="markets">
      <View style={{ gap: Spacing.xs }}>
        <T variant="footnote">{REFERENCE_LABEL} · USDT pairs · not your balances</T>
        <FreshnessLabel testID="markets-freshness" freshness={freshnessOf(newest || null, m.now)} receivedAt={newest || undefined} offline={offline} />
      </View>
      <Input testID="markets-search" placeholder="Search (e.g. ETH)" value={search} onChangeText={setSearch} accessibilityLabel="Search markets" autoCapitalize="characters" />
      <SegmentedPills
        testID="markets-category"
        items={[
          { key: 'all', label: 'All' },
          { key: 'favorites', label: `Favorites${favorites.length ? ` (${favorites.length})` : ''}` },
          { key: 'stable', label: 'Stablecoins' },
        ]}
        value={category}
        onChange={setCategory}
      />
      <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }} accessibilityRole="tablist">
        <T variant="footnote">Sort</T>
        {SORTS.map((s) => {
          const on = s.key === sort;
          return (
            <Pressable
              key={s.key}
              testID={`sort-${s.key}`}
              onPress={() => pickSort(s.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Sort by ${s.label}${on ? `, ${dir === 'desc' ? 'descending' : 'ascending'}` : ''}`}
              style={{ minHeight: HitTarget, justifyContent: 'center', paddingHorizontal: Spacing.sm }}>
              <T variant="label" style={{ color: on ? t.primary : t.textSecondary }}>
                {s.label}{on ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </T>
            </Pressable>
          );
        })}
      </View>
      {offline && <Notice tone="warning">You&apos;re offline. Prices pause and resume when you reconnect.</Notice>}
      {loading && <LoadingState rows={6} height={64} label="Loading markets" />}
      {error ? <ErrorState title="Couldn't load Binance market data" error={error} onRetry={() => { m.info.refetch(); m.rest.refetch(); }} /> : null}
      {!loading && !error && list.length === 0 && (
        category === 'favorites' && !search ? (
          <EmptyState icon="star" title="No favorites yet" body="Tap the star on any market to keep it here." />
        ) : (
          <EmptyState icon="search" title="No matching markets" body={search ? `Nothing matches “${search}”.` : 'No markets in this category.'} />
        )
      )}
      <View style={{ gap: Spacing.sm }}>
        {list.map((tk) => (
          <MarketRow
            key={tk.symbol}
            q={m.quote({ kind: 'pair', symbol: tk.symbol })}
            fav={favorites.includes(tk.symbol)}
            onToggleFav={() => toggleFav(tk.symbol)}
            onPress={() => router.push({ pathname: '/markets/[symbol]', params: { symbol: tk.symbol } })}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
        <Icon name="info" size="sm" color="textTertiary" />
        <T variant="footnote" style={{ flex: 1 }}>Public Binance spot data, no account or API key. VaultLite holds testnet assets only; these prices are not their value.</T>
      </View>
    </Screen>
  );
}
