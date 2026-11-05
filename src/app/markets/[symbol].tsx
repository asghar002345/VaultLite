import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FreshnessLabel, KlineChart, PriceChange, REFERENCE_LABEL, Stat } from '@/components/market';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/states';
import { Screen, T } from '@/components/ui';
import { SegmentedPills, Skeleton } from '@/components/wallet';
import { LoadingOverlay, useRefreshControl } from '@/components/loading';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { MK, useKlines, useTickers } from '@/hooks/use-market';
import { useTheme } from '@/hooks/use-theme';
import { useOffline } from '@/services/market/offline';
import { INTERVALS, type KlineInterval } from '@/services/market/binance-rest';
import { chartPhase } from '@/services/market/chart';
import { formatCompact, formatPrice, spokenPct } from '@/services/market/format';
import { baseOf } from '@/services/market/symbols';
import { toggleFav, useFavorites } from '@/store/favorites';

export default function MarketDetail() {
  const { symbol = '' } = useLocalSearchParams<{ symbol: string }>();
  const sym = symbol.toUpperCase();
  const t = useTheme();
  const offlineNow = useOffline();
  const favorites = useFavorites();
  const m = useTickers([sym]);
  const q = m.quote({ kind: 'pair', symbol: sym });
  const [interval, setIv] = useState<KlineInterval>('1h');
  const base = baseOf(sym);
  const fav = favorites.includes(sym);
  const qc = useQueryClient();
  const pull = useRefreshControl(() => Promise.all([m.rest.refetch(), qc.refetchQueries({ queryKey: MK.klines(sym, interval) })]));
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
    <Screen testID="market-detail" refreshControl={pull.control}>
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
              <FreshnessLabel freshness={q.freshness} receivedAt={tk.receivedAt} offline={offlineNow} />
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
        <Chart symbol={sym} interval={interval} dp={dp} />
      </View>

      <Section title="24h">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: t.border, borderRadius: Radius.lg, padding: Spacing.md, backgroundColor: t.surface }}>
          <Stat label="Bid" testID="stat-bid" value={tk ? (tk.bid ? formatPrice(tk.bid, dp) : '—') : null} />
          <Stat label="Ask" testID="stat-ask" value={tk ? (tk.ask ? formatPrice(tk.ask, dp) : '—') : null} />
          <Stat label="High" value={tk ? formatPrice(tk.high, dp) : null} />
          <Stat label="Low" value={tk ? formatPrice(tk.low, dp) : null} />
          <Stat label={`Volume (${base})`} value={tk ? formatCompact(Number(tk.baseVolume)) : null} />
          <Stat label="Volume (USDT)" value={tk ? formatCompact(tk.quoteVolume) : null} />
        </View>
      </Section>
      <T variant="footnote">Source: Binance public spot API. Display only — VaultLite does not trade, and testnet balances have no market value.</T>
    </Screen>
  );
}

function Chart({ symbol, interval, dp }: { symbol: string; interval: KlineInterval; dp: number | null }) {
  const k = useKlines(symbol, interval);
  const label = INTERVALS.find((i) => i.key === interval)?.label ?? interval;
  // First load: skeleton. Range switch: keep the previous chart dimmed under an overlay (placeholderData),
  // but never present the previous range's candles as this range once the fetch failed or is paused offline.
  const phase = chartPhase(k);
  if (phase === 'skeleton') return <LoadingState rows={1} height={200} label="Loading chart" />;
  if (phase === 'error')
    return k.error ? (
      <ErrorState title={`Couldn't load ${label} chart`} error={k.error} onRetry={() => k.refetch()} />
    ) : (
      <EmptyState icon="markets" title={`${label} chart unavailable`} body="You're offline. The chart loads when you reconnect." />
    );
  if (phase === 'empty' || !k.data) return <EmptyState icon="markets" title="No chart data" body="Binance returned no candles for this range." />;
  const first = k.data[0].close;
  const last = k.data[k.data.length - 1].close;
  const pct = first ? ((last - first) / first) * 100 : null;
  const hi = Math.max(...k.data.map((c) => c.high));
  const lo = Math.min(...k.data.map((c) => c.low));
  const switching = phase === 'switching';
  return (
    <LoadingOverlay active={switching} label={`Loading ${label}`} testID="chart-loading">
    <View style={{ gap: Spacing.sm }}>
      <View testID="range-summary" style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
        <T variant="footnote">{label} range</T>
        <PriceChange pct={pct} />
        <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>H {formatPrice(String(hi), dp)} · L {formatPrice(String(lo), dp)}</T>
      </View>
      <KlineChart candles={k.data} label={`${label} price chart, ${k.data.length} candles, ${spokenPct(pct)} over the range, high ${formatPrice(String(hi), dp)}, low ${formatPrice(String(lo), dp)}`} />
    </View>
    </LoadingOverlay>
  );
}
