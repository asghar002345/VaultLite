import { useNetInfo } from '@react-native-community/netinfo';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FreshnessLabel, KlineChart, PriceChange, REFERENCE_LABEL, Stat } from '@/components/market';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/states';
import { Screen, T } from '@/components/ui';
import { SegmentedPills, Skeleton } from '@/components/wallet';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { useKlines, useTickers } from '@/hooks/use-market';
import { useTheme } from '@/hooks/use-theme';
import { INTERVALS, type KlineInterval } from '@/services/market/binance-rest';
import { formatCompact, formatPrice, spokenPct } from '@/services/market/format';
import { baseOf } from '@/services/market/symbols';
import { toggleFav, useFavorites } from '@/store/favorites';

export default function MarketDetail() {
  const { symbol = '' } = useLocalSearchParams<{ symbol: string }>();
  const sym = symbol.toUpperCase();
  const t = useTheme();
  const net = useNetInfo();
  const favorites = useFavorites();
  const m = useTickers([sym]);
  const q = m.quote({ kind: 'pair', symbol: sym });
  const [interval, setIv] = useState<KlineInterval>('1h');
  const base = baseOf(sym);
  const fav = favorites.includes(sym);
  const header = (
    <Stack.Screen
      options={{
        title: `${base} / USDT`,
        headerRight: () => (
          <Pressable testID="detail-fav" onPress={() => toggleFav(sym)} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'} style={{ width: HitTarget, height: HitTarget, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="star" tint={fav ? t.primary : t.textSecondary} />
          </Pressable>
        ),
      }}
    />
  );
  if (q.ref.kind !== 'pair') {
    return (
      <Screen testID="market-detail">
        {header}
        <EmptyState icon="ban" title="Market unavailable" body={q.ref.kind === 'unavailable' ? q.ref.reason : 'No market'} />
      </Screen>
    );
  }
  const tk = q.ticker;
  const dp = q.tickDecimals;
  return (
    <Screen testID="market-detail">
      {header}
      <View style={{ gap: Spacing.xs }}>
        <T variant="footnote">{REFERENCE_LABEL} · {sym}</T>
        {tk ? (
          <>
            <T variant="hero" testID="market-price" accessibilityLabel={`${formatPrice(tk.last, dp)} USDT, ${spokenPct(tk.changePct)} in 24 hours`}>
              {formatPrice(tk.last, dp)} <T variant="label" style={{ color: t.textSecondary }}>USDT</T>
            </T>
            <View style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'center' }}>
              <PriceChange pct={tk.changePct} testID="market-change" />
              <T variant="footnote">24h</T>
              <FreshnessLabel freshness={q.freshness} receivedAt={tk.receivedAt} offline={net.isConnected === false} />
            </View>
          </>
        ) : m.rest.error ? (
          <ErrorState title="Couldn't load price" error={m.rest.error} onRetry={() => m.rest.refetch()} />
        ) : (
          <Skeleton height={56} />
        )}
      </View>

      <View style={{ gap: Spacing.smd }}>
        <SegmentedPills testID="interval" items={INTERVALS.map((i) => ({ key: i.key, label: i.label }))} value={interval} onChange={setIv} />
        <Chart symbol={sym} interval={interval} />
      </View>

      <Section title="24h">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: t.border, borderRadius: Radius.lg, padding: Spacing.md, backgroundColor: t.surface }}>
          <Stat label="Bid" testID="stat-bid" value={tk?.bid ? formatPrice(tk.bid, dp) : '—'} />
          <Stat label="Ask" testID="stat-ask" value={tk?.ask ? formatPrice(tk.ask, dp) : '—'} />
          <Stat label="High" value={tk ? formatPrice(tk.high, dp) : '—'} />
          <Stat label="Low" value={tk ? formatPrice(tk.low, dp) : '—'} />
          <Stat label={`Volume (${base})`} value={tk ? formatCompact(Number(tk.baseVolume)) : '—'} />
          <Stat label="Volume (USDT)" value={tk ? formatCompact(tk.quoteVolume) : '—'} />
        </View>
      </Section>
      <T variant="footnote">Source: Binance public spot API. Display only — VaultLite does not trade, and testnet balances have no market value.</T>
    </Screen>
  );
}

function Chart({ symbol, interval }: { symbol: string; interval: KlineInterval }) {
  const k = useKlines(symbol, interval);
  const label = INTERVALS.find((i) => i.key === interval)?.label ?? interval;
  if (k.isPending) return <LoadingState rows={1} height={200} label="Loading chart" />;
  if (k.isError) return <ErrorState title="Couldn't load chart" error={k.error} onRetry={() => k.refetch()} />;
  if (!k.data || k.data.length < 2) return <EmptyState icon="markets" title="No chart data" body="Binance returned no candles for this range." />;
  const first = k.data[0].close;
  const last = k.data[k.data.length - 1].close;
  const pct = first ? ((last - first) / first) * 100 : null;
  return <KlineChart candles={k.data} label={`${label} price chart, ${k.data.length} candles, ${spokenPct(pct)} over the range`} />;
}
