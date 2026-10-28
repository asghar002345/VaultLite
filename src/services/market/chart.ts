import type { Candle } from './binance-rest';

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
