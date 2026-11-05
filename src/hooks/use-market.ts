import AsyncStorage from '@react-native-async-storage/async-storage';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { get24h, getKlines, INTERVALS, marketRetry, marketRetryDelay, type Candle, type KlineInterval, type SymbolInfo, type Ticker } from '@/services/market/binance-rest';
import { MarketHttpError } from '@/services/market/binance-rest';
import { klineStream, tickerStream } from '@/services/market/binance-ws';
import { ALL_SYMBOLS, loadExchangeInfo, loadInfoWithCache } from '@/services/market/exchange-info';
import { isOffline } from '@/services/market/offline';
import { decimalsFromStep } from '@/services/market/format';
import { getSocketStatus, retainStreams, subscribeSocketStatus } from '@/services/market/socket-host';
import { freshnessOf, needsRefetch, type Freshness } from '@/services/market/stale';
import { marketRefFor, validateRef, type MarketRef } from '@/services/market/symbols';

export const MK = {
  info: ['market', 'exchangeInfo'] as const,
  tickers: ['market', 'tickers'] as const,
  rest: (key: string) => ['market', 'rest', key] as const,
  klines: (s: string, i: KlineInterval) => ['market', 'klines', s, i] as const,
};

const INFO_CACHE = 'vaultlite.market.exchangeInfo.v1';
const INFO_TTL = 24 * 3600_000;

/** Merge tickers into the shared cache entry, keeping the newer quote per symbol. */
export function mergeTickers(prev: Record<string, Ticker> | undefined, next: Ticker[]): Record<string, Ticker> {
  const out = { ...(prev ?? {}) };
  for (const t of next) {
    const cur = out[t.symbol];
    if (!cur || t.eventTime >= cur.eventTime || t.receivedAt - cur.receivedAt > 5_000) out[t.symbol] = t;
  }
  return out;
}

/** Update/append the live candle (WS kline). Keeps series length bounded. */
export function mergeCandle(prev: Candle[] | undefined, c: Candle, max = 1000): Candle[] | undefined {
  if (!prev?.length) return prev;
  const last = prev[prev.length - 1];
  if (c.openTime === last.openTime) return [...prev.slice(0, -1), c];
  if (c.openTime > last.openTime) return [...prev, c].slice(-max);
  return prev;
}

export function marketSink(qc: QueryClient) {
  return {
    ticker: (t: Ticker) => qc.setQueryData<Record<string, Ticker>>(MK.tickers, (p) => mergeTickers(p, [t])),
    kline: (s: string, i: KlineInterval, c: Candle) => qc.setQueryData<Candle[]>(MK.klines(s, i), (p) => mergeCandle(p, c)),
  };
}

/** exchangeInfo (status + tick/step precision), cached 24h on device; offline falls back to the cached copy. */
export function useExchangeInfo() {
  return useQuery({
    queryKey: MK.info,
    retry: marketRetry,
    retryDelay: marketRetryDelay,
    staleTime: INFO_TTL,
    gcTime: Infinity,
    queryFn: () =>
      loadInfoWithCache({
        load: () => loadExchangeInfo(ALL_SYMBOLS),
        getItem: () => AsyncStorage.getItem(INFO_CACHE),
        setItem: (v) => AsyncStorage.setItem(INFO_CACHE, v),
      }),
  });
}

export function useSocketStatus() {
  return useSyncExternalStore(subscribeSocketStatus, getSocketStatus, getSocketStatus);
}

/** Ticks every `ms` so freshness labels age without new data. */
export function useNow(ms = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export interface Quote {
  ref: MarketRef;
  ticker: Ticker | null;
  info: SymbolInfo | null;
  tickDecimals: number | null;
  freshness: Freshness;
}

/**
 * Live tickers for `symbols`: REST initial load (+ fallback polling every 15s while the stream is
 * not open, and refetch whenever a quote is ≥30s old), WS updates merged into the same cache.
 */
export function useTickers(symbols: readonly string[]) {
  const qc = useQueryClient();
  const info = useExchangeInfo();
  const ws = useSocketStatus();
  const now = useNow();
  const valid = useMemo(
    () => [...new Set(symbols)].filter((s) => (info.data ? info.data[s]?.status === 'TRADING' : ALL_SYMBOLS.includes(s))).sort(),
    [symbols, info.data],
  );
  const key = valid.join(',');
  const rest = useQuery({
    queryKey: MK.rest(key),
    retry: marketRetry,
    retryDelay: marketRetryDelay,
    enabled: valid.length > 0,
    staleTime: 10_000,
    refetchInterval: ws === 'open' ? false : (q) => { const e = q.state.error; return e instanceof MarketHttpError && e.retryAfterMs ? Math.max(15_000, e.retryAfterMs) : 15_000; },
    queryFn: async ({ signal }) => {
      const list = await get24h(valid, { signal });
      qc.setQueryData<Record<string, Ticker>>(MK.tickers, (p) => mergeTickers(p, list));
      return Date.now();
    },
  });
  const map = useQuery({ queryKey: MK.tickers, queryFn: () => qc.getQueryData<Record<string, Ticker>>(MK.tickers) ?? {}, staleTime: Infinity, initialData: {} as Record<string, Ticker> });

  useEffect(() => {
    if (!valid.length) return;
    return retainStreams(valid.map(tickerStream));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const tickers = map.data;
  useEffect(() => {
    // Offline: React Query is paused via onlineManager (bindOnlineManager); don't queue refetches.
    if (!valid.length || rest.isFetching || isOffline()) return;
    if (valid.some((s) => tickers[s] && needsRefetch(tickers[s].receivedAt, now))) rest.refetch();
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const quote = (ref: MarketRef): Quote => {
    const r = validateRef(ref, info.data);
    if (r.kind !== 'pair') return { ref: r, ticker: null, info: null, tickDecimals: null, freshness: 'none' };
    const t = tickers[r.symbol] ?? null;
    const si = info.data?.[r.symbol] ?? null;
    return { ref: r, ticker: t, info: si, tickDecimals: decimalsFromStep(si?.tickSize), freshness: freshnessOf(t?.receivedAt, now) };
  };
  return { tickers, info, rest, ws, now, quote, valid };
}

/** Convenience: quote for a wallet asset. */
export function useAssetQuote(asset: { symbol: string; custom?: boolean } | null) {
  const ref = asset ? marketRefFor(asset) : ({ kind: 'unavailable', reason: 'Unknown asset' } as const);
  const m = useTickers(ref.kind === 'pair' ? [ref.symbol] : []);
  return { ...m, q: m.quote(ref) };
}

/** Candles via REST + live candle via WS kline stream while mounted. */
export function useKlines(symbol: string, interval: KlineInterval) {
  const limit = INTERVALS.find((i) => i.key === interval)?.limit ?? 100;
  // keepPreviousData: a range switch keeps the old chart on screen (dimmed by LoadingOverlay) instead of blanking it.
  const q = useQuery({ queryKey: MK.klines(symbol, interval), placeholderData: keepPreviousData, staleTime: 60_000, retry: marketRetry, retryDelay: marketRetryDelay, queryFn: ({ signal }) => getKlines(symbol, interval, limit, { signal }) });
  useEffect(() => retainStreams([klineStream(symbol, interval)]), [symbol, interval]);
  return q;
}
