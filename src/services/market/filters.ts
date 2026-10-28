import type { Ticker } from './binance-rest';
import { baseOf } from './symbols';

export type MarketCategory = 'all' | 'favorites' | 'stable';
export type SortKey = 'volume' | 'price' | 'change';
export type SortDir = 'asc' | 'desc';

/** Stablecoin bases (quote = USDT). */
export const STABLE_BASES = new Set(['USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP']);

export interface MarketQuery {
  search: string;
  category: MarketCategory;
  sort: SortKey;
  dir: SortDir;
  favorites: readonly string[];
}

const sortVal = (t: Ticker, k: SortKey) => (k === 'price' ? Number(t.last) : k === 'change' ? t.changePct : t.quoteVolume);

/** Pure: filter by category + search (base asset or full symbol), then stable sort. NaN values sink. */
export function applyMarketQuery(list: readonly Ticker[], q: MarketQuery): Ticker[] {
  const needle = q.search.trim().toUpperCase().replace(/[\s/]/g, '');
  const fav = new Set(q.favorites);
  return list
    .filter((t) => (q.category === 'favorites' ? fav.has(t.symbol) : q.category === 'stable' ? STABLE_BASES.has(baseOf(t.symbol)) : true))
    .filter((t) => !needle || t.symbol.includes(needle) || baseOf(t.symbol).startsWith(needle))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const x = sortVal(a.t, q.sort);
      const y = sortVal(b.t, q.sort);
      const xn = !isFinite(x);
      const yn = !isFinite(y);
      if (xn || yn) return xn === yn ? a.i - b.i : xn ? 1 : -1;
      return (q.dir === 'asc' ? x - y : y - x) || a.i - b.i;
    })
    .map((r) => r.t);
}

export function toggleFavorite(list: readonly string[], symbol: string): string[] {
  return list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol];
}
