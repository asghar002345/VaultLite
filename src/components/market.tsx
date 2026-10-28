import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { T } from '@/components/ui';
import { Skeleton } from '@/components/wallet';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Quote } from '@/hooks/use-market';
import type { Candle } from '@/services/market/binance-rest';
import { arrowOf, directionOf, formatPct, formatPrice, spokenPct } from '@/services/market/format';
import { clockLabel, type Freshness } from '@/services/market/stale';
import { baseOf } from '@/services/market/symbols';

/** Label used everywhere market data appears, so it can't be mistaken for a balance. */
export const REFERENCE_LABEL = 'Binance mainnet reference';

/** Signed % with ▲/▼ glyph and direction colour (never colour alone). */
export function PriceChange({ pct, testID }: { pct: number | null | undefined; testID?: string }) {
  const t = useTheme();
  const d = directionOf(pct);
  const color = d === 'up' ? t.priceUp : d === 'down' ? t.priceDown : t.priceFlat;
  return (
    <T testID={testID} variant="number" accessibilityLabel={spokenPct(pct)} style={{ color, fontSize: 13, lineHeight: 18 }}>
      {pct == null ? '—' : `${arrowOf(d)} ${formatPct(pct)}`}
    </T>
  );
}

/** Freshness / connection caption. Stale quotes are labelled, never presented as live. */
export function Freshness({ freshness, receivedAt, offline, testID }: { freshness: Freshness; receivedAt?: number; offline?: boolean; testID?: string }) {
  const t = useTheme();
  const text = offline
    ? `Offline${receivedAt ? ` · last update ${clockLabel(receivedAt)}` : ''}`
    : freshness === 'live'
      ? 'Live'
      : freshness === 'lagging'
        ? 'Refreshing…'
        : freshness === 'stale'
          ? `Stale · updated ${receivedAt ? clockLabel(receivedAt) : '—'}`
          : 'Waiting for data';
  const color = offline || freshness === 'stale' ? t.warning : t.textTertiary;
  return (
    <View testID={testID} style={s.fresh} accessibilityLabel={`Market data ${text}`}>
      <View style={[s.dot, { backgroundColor: freshness === 'live' && !offline ? t.priceUp : color }]} />
      <T variant="footnote" style={{ color }}>{text}</T>
    </View>
  );
}

/** Compact reference price for a wallet asset row. Explicit "No market" when unmapped. */
export function RowMarketPrice({ q }: { q: Quote }) {
  const t = useTheme();
  if (q.ref.kind === 'quote') return <T variant="footnote" style={{ color: t.textTertiary }}>Quote asset</T>;
  if (q.ref.kind === 'unavailable') return <T variant="footnote" style={{ color: t.textTertiary }} accessibilityLabel={q.ref.reason}>No market</T>;
  if (!q.ticker) return <T variant="footnote" style={{ color: t.textTertiary }}>—</T>;
  const stale = q.freshness === 'stale';
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityLabel={`${REFERENCE_LABEL}: ${formatPrice(q.ticker.last, q.tickDecimals)} USDT, ${spokenPct(q.ticker.changePct)}${stale ? ', stale' : ''}`}>
      <T variant="footnote" style={{ color: stale ? t.warning : t.textSecondary, fontVariant: ['tabular-nums'] }}>
        {formatPrice(q.ticker.last, q.tickDecimals)} USDT{stale ? ' · stale' : ''}
      </T>
      <PriceChange pct={q.ticker.changePct} />
    </View>
  );
}

/** One market row (Markets list). ≥44pt target, favorite toggle with its own label. */
export function MarketRow({ q, fav, onPress, onToggleFav }: { q: Quote; fav: boolean; onPress: () => void; onToggleFav: () => void }) {
  const t = useTheme();
  if (q.ref.kind !== 'pair') return null;
  const sym = q.ref.symbol;
  const base = baseOf(sym);
  return (
    <Pressable
      testID={`market-${sym}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={q.ticker ? `${base} ${formatPrice(q.ticker.last, q.tickDecimals)} USDT, ${spokenPct(q.ticker.changePct)}` : `${base}, price loading`}
      accessibilityHint="Opens market detail"
      style={[s.row, { borderColor: t.border, backgroundColor: t.surface }]}>
      <Pressable testID={`fav-${sym}`} onPress={onToggleFav} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? `Remove ${base} from favorites` : `Add ${base} to favorites`} style={s.star}>
        <Icon name="star" size="sm" tint={fav ? t.primary : t.textTertiary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <T variant="label">{base}<T variant="footnote"> / USDT</T></T>
        <T variant="footnote">Vol {q.ticker ? compactUsd(q.ticker.quoteVolume) : '—'}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {q.ticker ? <T variant="number">{formatPrice(q.ticker.last, q.tickDecimals)}</T> : <View style={{ width: 80 }}><Skeleton height={18} /></View>}
        <PriceChange pct={q.ticker?.changePct} />
      </View>
    </Pressable>
  );
}

const compactUsd = (n: number) => {
  const a = Math.abs(n);
  return a >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);
};

/** Pure: candle closes → SVG path in a w×h box. */
export function linePath(candles: Pick<Candle, 'close'>[], w: number, h: number, pad = 4): { line: string; area: string } | null {
  const ys = candles.map((c) => c.close).filter((v) => isFinite(v));
  if (ys.length < 2 || w <= 0) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pts = ys.map((v, i) => [(i / (ys.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}

/** Close-price line chart (klines). Accessible summary instead of per-point focus. */
export function KlineChart({ candles, height = 200, label }: { candles: Candle[]; height?: number; label: string }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const p = linePath(candles, w, height);
  const first = candles[0]?.close;
  const last = candles[candles.length - 1]?.close;
  const up = first != null && last != null ? last >= first : true;
  const color = up ? t.priceUp : t.priceDown;
  return (
    <View testID="kline-chart" onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {p && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={p.area} fill="url(#g)" />
          <Path d={p.line} stroke={color} strokeWidth={1.5} fill="none" />
        </Svg>
      )}
    </View>
  );
}

/** Label/value stat cell (bid/ask/high/low/volume). */
export function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label} ${value}`}>
      <T variant="footnote">{label}</T>
      <T testID={testID} variant="number">{value}</T>
    </View>
  );
}

const s = StyleSheet.create({
  fresh: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.smd, minHeight: 64, paddingHorizontal: Spacing.md, paddingVertical: Spacing.smd, borderRadius: Radius.lg, borderWidth: 1 },
  star: { width: HitTarget, height: HitTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -Spacing.smd },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2, paddingVertical: Spacing.sm },
});
