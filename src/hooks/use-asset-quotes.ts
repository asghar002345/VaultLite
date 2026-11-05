import { useMemo } from 'react';

import { marketRefFor } from '@/services/market/symbols';
import { useTickers, type Quote } from './use-market';

/** One ticker subscription for a list of wallet assets; returns a quote per row key. */
export function useAssetQuotes(rows: { chain: string; address: string; symbol: string; custom?: boolean }[]) {
  const refs = useMemo(() => rows.map((r) => [`${r.chain}:${r.address}`, marketRefFor(r)] as const), [rows]);
  const symbols = useMemo(() => [...new Set(refs.flatMap(([, r]) => (r.kind === 'pair' ? [r.symbol] : [])).concat('USDCUSDT'))], [refs]);
  const m = useTickers(symbols);
  const quotes: Record<string, Quote> = {};
  for (const [k, r] of refs) quotes[k] = m.quote(r);
  const usdc = m.quote({ kind: 'pair', symbol: 'USDCUSDT' });
  return { quotes, usdc, m };
}
