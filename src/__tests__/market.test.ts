import { binanceGet, marketRetry, marketRetryDelay, parseRetryAfter, rateLimitedUntil, MarketHttpError, parse24h, parseExchangeInfo, parseKlines, resetHostPreference, currentHost } from '@/services/market/binance-rest';
import { backoffMs, MarketSocket, streamUrl, type MinimalWebSocket } from '@/services/market/binance-ws';
import { loadExchangeInfo } from '@/services/market/exchange-info';
import { applyMarketQuery, toggleFavorite } from '@/services/market/filters';
import { arrowOf, decimalsFromStep, directionOf, formatCompact, formatPct, formatPrice, roundDecimal, spokenPct } from '@/services/market/format';
import { clockLabel, freshnessOf, needsRefetch } from '@/services/market/stale';
import { marketRefFor, validateRef } from '@/services/market/symbols';
import { mergeCandle, mergeTickers } from '@/hooks/use-market';
import { parseFavorites } from '@/store/favorites';
import type { Ticker } from '@/services/market/binance-rest';
import { stableTotalUsdt } from '@/lib/amount';
import { linePath } from '@/services/market/chart';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const tk = (symbol: string, last: string, changePct: number, quoteVolume: number, extra: Partial<Ticker> = {}): Ticker => ({
  symbol, last, changePct, quoteVolume, high: last, low: last, baseVolume: '1', bid: null, ask: null, eventTime: 1, receivedAt: 1, source: 'rest', ...extra,
});

describe('symbol mapping', () => {
  it('maps wallet assets to Binance USDT pairs', () => {
    expect(marketRefFor({ symbol: 'ETH' })).toEqual({ kind: 'pair', symbol: 'ETHUSDT' });
    expect(marketRefFor({ symbol: 'tBNB' })).toEqual({ kind: 'pair', symbol: 'BNBUSDT' });
    expect(marketRefFor({ symbol: 'POL' })).toEqual({ kind: 'pair', symbol: 'POLUSDT' });
    expect(marketRefFor({ symbol: 'USDC' })).toEqual({ kind: 'pair', symbol: 'USDCUSDT' });
    expect(marketRefFor({ symbol: 'USDT' })).toEqual({ kind: 'quote' });
  });
  it('never maps unknown or custom tokens', () => {
    expect(marketRefFor({ symbol: 'FOO' }).kind).toBe('unavailable');
    expect(marketRefFor({ symbol: 'ETH', custom: true }).kind).toBe('unavailable');
  });
  it('validates against exchangeInfo status', () => {
    const ref = { kind: 'pair', symbol: 'ETHUSDT' } as const;
    expect(validateRef(ref, { ETHUSDT: { status: 'TRADING' } })).toBe(ref);
    expect(validateRef(ref, { ETHUSDT: { status: 'BREAK' } })).toEqual({ kind: 'unavailable', reason: 'ETHUSDT is break on Binance' });
    expect(validateRef(ref, {}).kind).toBe('unavailable');
    expect(validateRef(ref, undefined)).toBe(ref);
  });
});

describe('formatting & precision', () => {
  it('derives decimals from tick/step size', () => {
    expect(decimalsFromStep('0.01000000')).toBe(2);
    expect(decimalsFromStep('1.00000000')).toBe(0);
    expect(decimalsFromStep('0.00001000')).toBe(5);
    expect(decimalsFromStep(undefined)).toBeNull();
    expect(decimalsFromStep('0')).toBeNull();
  });
  it('rounds decimal strings half-up without float error', () => {
    expect(roundDecimal('2353.30000000', 2)).toBe('2353.30');
    expect(roundDecimal('0.09199000', 4)).toBe('0.0920');
    expect(roundDecimal('1.005', 2)).toBe('1.01');
    expect(roundDecimal('9.999', 2)).toBe('10.00');
    expect(roundDecimal('80894.01', 0)).toBe('80894');
    expect(roundDecimal('-0.001', 2)).toBe('0.00');
  });
  it('formats prices with grouping at tick precision', () => {
    expect(formatPrice('80894.01000000', 2)).toBe('80,894.01');
    expect(formatPrice('0.33150000', 4)).toBe('0.3315');
    expect(formatPrice('1.00118000', 5)).toBe('1.00118');
    expect(formatPrice(null, 2)).toBe('—');
    expect(formatPrice('abc', 2)).toBe('—');
    expect(formatPrice('0.091990', null)).toBe('0.091990');
  });
  it('formats change with explicit sign and arrows', () => {
    expect(formatPct(1.6)).toBe('+1.60%');
    expect(formatPct(-0.424)).toBe('\u22120.42%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(NaN)).toBe('—');
    expect(directionOf(2)).toBe('up');
    expect(directionOf(-2)).toBe('down');
    expect(directionOf(0)).toBe('flat');
    expect(arrowOf('up')).toBe('▲');
    expect(spokenPct(-1.234)).toBe('down 1.23 percent');
  });
  it('compacts volume', () => {
    expect(formatCompact(1_234_567_890)).toBe('1.23B');
    expect(formatCompact(45_600_000)).toBe('45.60M');
    expect(formatCompact(999)).toBe('999.00');
    expect(formatCompact(null)).toBe('—');
  });
});

describe('stale detection', () => {
  it('classifies 30s / 120s thresholds', () => {
    expect(freshnessOf(null, 0)).toBe('none');
    expect(freshnessOf(1000, 1000 + 29_999)).toBe('live');
    expect(freshnessOf(1000, 1000 + 30_000)).toBe('lagging');
    expect(freshnessOf(1000, 1000 + 120_000)).toBe('stale');
    expect(needsRefetch(1000, 1000 + 31_000)).toBe(true);
    expect(needsRefetch(1000, 1000 + 1_000)).toBe(false);
    expect(clockLabel(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05');
  });
});

describe('REST client', () => {
  const res = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status < 300, status, json: async () => body, headers: { get: (k: string) => headers[k] ?? null } });
  beforeEach(() => resetHostPreference());
  it('falls back from data-api to api.binance.com and remembers the working host', async () => {
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      return url.startsWith('https://data-api') ? res(503, {}) : res(200, { ok: 1 });
    });
    await expect(binanceGet('/api/v3/ping', { fetchImpl })).resolves.toEqual({ ok: 1 });
    expect(calls).toEqual(['https://data-api.binance.vision/api/v3/ping', 'https://api.binance.com/api/v3/ping']);
    expect(currentHost()).toBe('https://api.binance.com');
  });
  it('surfaces 451 geo-block from both hosts as an error', async () => {
    const fetchImpl = jest.fn(async () => res(451, {}));
    await expect(binanceGet('/x', { fetchImpl })).rejects.toThrow('unavailable from this location');
  });
  it('does not hammer on rate limit and reports Retry-After', async () => {
    const fetchImpl = jest.fn(async () => res(429, {}, { 'retry-after': '7' }));
    const err = (await binanceGet('/x', { fetchImpl }).catch((e: unknown) => e)) as MarketHttpError;
    expect(err).toBeInstanceOf(MarketHttpError);
    expect(err.retryAfterMs).toBe(7000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('honours Retry-After: cooldown blocks further requests until it expires', async () => {
    let t = 1_000_000;
    const now = () => t;
    const fetchImpl = jest.fn(async () => res(429, {}, { 'retry-after': '10' }));
    await expect(binanceGet('/x', { fetchImpl, now })).rejects.toMatchObject({ status: 429, retryAfterMs: 10_000 });
    expect(rateLimitedUntil()).toBe(1_010_000);
    t += 4_000;
    const ok = jest.fn(async () => res(200, { ok: 1 }));
    await expect(binanceGet('/x', { fetchImpl: ok, now })).rejects.toMatchObject({ status: 429, retryAfterMs: 6_000 });
    expect(ok).not.toHaveBeenCalled();
    t += 6_000;
    await expect(binanceGet('/x', { fetchImpl: ok, now })).resolves.toEqual({ ok: 1 });
  });
  it('parses Retry-After seconds / HTTP-date / missing, and 418 waits longer', () => {
    expect(parseRetryAfter('5', 429, 0)).toBe(5000);
    expect(parseRetryAfter(new Date(70_000).toUTCString(), 429, 10_000)).toBe(60_000);
    expect(parseRetryAfter(null, 429)).toBe(60_000);
    expect(parseRetryAfter(null, 418)).toBe(120_000);
  });
  it('retry policy waits Retry-After and never retries 400/451', () => {
    const rl = new MarketHttpError(429, 'x', 7000);
    expect(marketRetry(0, rl)).toBe(true);
    expect(marketRetry(1, rl)).toBe(false);
    expect(marketRetryDelay(0, rl)).toBe(7000);
    expect(marketRetry(0, new MarketHttpError(451, 'x'))).toBe(false);
    expect(marketRetry(0, new MarketHttpError(400, 'x'))).toBe(false);
    expect(marketRetry(1, new Error('net'))).toBe(true);
    expect(marketRetryDelay(2, new Error('net'))).toBe(4000);
  });
  it('parses 24h ticker, exchangeInfo and klines', () => {
    const t = parse24h({ symbol: 'BTCUSDT', lastPrice: '1', priceChangePercent: '1.600', highPrice: '2', lowPrice: '0.5', volume: '3', quoteVolume: '4.5', bidPrice: '0.9', askPrice: '1.1', closeTime: 9 }, 42);
    expect(t).toMatchObject({ changePct: 1.6, quoteVolume: 4.5, bid: '0.9', ask: '1.1', receivedAt: 42, source: 'rest' });
    const info = parseExchangeInfo({ symbols: [{ symbol: 'ETHUSDT', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'USDT', filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.01000000' }, { filterType: 'LOT_SIZE', stepSize: '0.00010000' }] }] });
    expect(info.ETHUSDT).toMatchObject({ tickSize: '0.01000000', stepSize: '0.00010000' });
    expect(parseKlines([[1, '1', '2', '0.5', '1.5', '10', 2, 'x']])[0]).toEqual({ openTime: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, closeTime: 2 });
  });
  it('exchangeInfo falls back to per-symbol on 400 and drops invalid symbols', async () => {
    const get = jest.fn(async (s: readonly string[]) => {
      if (s.length > 1 || s[0] === 'BADUSDT') throw new MarketHttpError(400, 'Invalid symbol');
      return { [s[0]]: { symbol: s[0], status: 'TRADING', baseAsset: '', quoteAsset: 'USDT' } };
    });
    const info = await loadExchangeInfo(['ETHUSDT', 'BADUSDT'], get);
    expect(Object.keys(info)).toEqual(['ETHUSDT']);
  });
});

class FakeWS implements MinimalWebSocket {
  static all: FakeWS[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  close() {
    this.closed = true;
  }
}

describe('WebSocket manager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWS.all = [];
  });
  afterEach(() => jest.useRealTimers());
  const mk = (onTicker = jest.fn()) => ({ s: new MarketSocket({ WebSocketImpl: FakeWS, onTicker, random: () => 0, now: () => 5 }), onTicker });
  const evt = (s: string, c: string) => ({ data: JSON.stringify({ stream: `${s.toLowerCase()}@ticker`, data: { e: '24hrTicker', E: 1, s, c, P: '1.0', h: c, l: c, v: '1', q: '2', b: c, a: c } }) });

  it('builds a combined stream URL', () => {
    expect(streamUrl('wss://h', ['a@ticker', 'b@ticker'])).toBe('wss://h/stream?streams=a@ticker/b@ticker');
  });
  it('backoff grows exponentially, capped at 30s', () => {
    expect([0, 1, 2, 3, 10].map((a) => backoffMs(a, () => 0.999999))).toEqual([1000, 2000, 4000, 8000, 30000]);
    expect(backoffMs(0, () => 0)).toBe(500);
  });
  it('throttles ticker bursts to one flush per interval with latest value', () => {
    const { s, onTicker } = mk();
    s.setStreams(['ethusdt@ticker']);
    const ws = FakeWS.all[0];
    ws.onopen?.({});
    ws.onmessage?.(evt('ETHUSDT', '1'));
    ws.onmessage?.(evt('ETHUSDT', '2'));
    expect(onTicker).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(onTicker).toHaveBeenCalledTimes(1);
    expect(onTicker.mock.calls[0][0]).toMatchObject({ symbol: 'ETHUSDT', last: '2', source: 'ws', receivedAt: 5 });
    s.close();
  });
  it('reconnects with backoff after close, rotating hosts', () => {
    const { s } = mk();
    s.setStreams(['ethusdt@ticker']);
    expect(FakeWS.all[0].url.startsWith('wss://data-stream.binance.vision')).toBe(true);
    FakeWS.all[0].onclose?.({});
    expect(s.getStatus()).toBe('reconnecting');
    jest.advanceTimersByTime(499);
    expect(FakeWS.all).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1].onclose?.({});
    jest.advanceTimersByTime(1000);
    expect(FakeWS.all).toHaveLength(3);
    expect(FakeWS.all[2].url.startsWith('wss://stream.binance.com:9443')).toBe(true);
    FakeWS.all[2].onopen?.({});
    expect(s.getStatus()).toBe('open');
    s.close();
  });
  it('treats a silent connection as dead (idle watchdog)', () => {
    const { s } = mk();
    s.setStreams(['ethusdt@ticker']);
    FakeWS.all[0].onopen?.({});
    jest.advanceTimersByTime(60_000);
    expect(FakeWS.all[0].closed).toBe(true);
    s.close();
  });
  it('recycles a socket that never opens (connect timeout)', () => {
    const { s } = mk();
    s.setStreams(['ethusdt@ticker']);
    jest.advanceTimersByTime(60_000);
    expect(FakeWS.all[0].closed).toBe(true);
    expect(s.getStatus()).toBe('reconnecting');
    jest.advanceTimersByTime(1000);
    expect(FakeWS.all).toHaveLength(2);
    s.close();
  });
  it('pauses (background/offline), resumes, and cleans up on close', () => {
    const { s } = mk();
    s.setStreams(['ethusdt@ticker']);
    s.pause();
    expect(FakeWS.all[0].closed).toBe(true);
    expect(s.getStatus()).toBe('paused');
    jest.advanceTimersByTime(120_000);
    expect(FakeWS.all).toHaveLength(1);
    s.resume();
    expect(FakeWS.all).toHaveLength(2);
    s.close();
    expect(FakeWS.all[1].closed).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not reconnect when the stream set is unchanged; empty set disconnects', () => {
    const { s } = mk();
    s.setStreams(['b', 'a']);
    s.setStreams(['a', 'b']);
    expect(FakeWS.all).toHaveLength(1);
    s.setStreams([]);
    expect(FakeWS.all[0].closed).toBe(true);
    expect(s.getStatus()).toBe('idle');
  });
  it('ignores malformed messages', () => {
    const { s, onTicker } = mk();
    s.setStreams(['x']);
    FakeWS.all[0].onmessage?.({ data: 'not json' });
    FakeWS.all[0].onmessage?.({ data: '{}' });
    jest.advanceTimersByTime(2000);
    expect(onTicker).not.toHaveBeenCalled();
    s.close();
  });
});

describe('cache merging', () => {
  it('keeps newer ticker per symbol', () => {
    const a = tk('ETHUSDT', '1', 0, 0, { eventTime: 10, receivedAt: 10 });
    const b = tk('ETHUSDT', '2', 0, 0, { eventTime: 5, receivedAt: 11 });
    expect(mergeTickers({ ETHUSDT: a }, [b]).ETHUSDT.last).toBe('1');
    expect(mergeTickers({ ETHUSDT: b }, [a]).ETHUSDT.last).toBe('1');
  });
  it('updates or appends the live candle', () => {
    const c = (t: number, close: number) => ({ openTime: t, closeTime: t + 1, open: 1, high: 1, low: 1, close, volume: 1 });
    expect(mergeCandle([c(1, 1), c(2, 1)], c(2, 9))!.map((x) => x.close)).toEqual([1, 9]);
    expect(mergeCandle([c(1, 1), c(2, 1)], c(3, 5), 2)!.map((x) => x.openTime)).toEqual([2, 3]);
    expect(mergeCandle(undefined, c(1, 1))).toBeUndefined();
  });
});

describe('Markets filters & sort', () => {
  const list = [tk('BTCUSDT', '80000', 1.6, 900), tk('ETHUSDT', '2350', -2, 500), tk('USDCUSDT', '1.0012', 0.01, 800), tk('TRXUSDT', 'x', 3, 10)];
  const base = { search: '', category: 'all' as const, sort: 'volume' as const, dir: 'desc' as const, favorites: [] as string[] };
  it('sorts by volume, price and change in both directions (NaN last)', () => {
    expect(applyMarketQuery(list, base).map((t) => t.symbol)).toEqual(['BTCUSDT', 'USDCUSDT', 'ETHUSDT', 'TRXUSDT']);
    expect(applyMarketQuery(list, { ...base, sort: 'price', dir: 'asc' }).map((t) => t.symbol)).toEqual(['USDCUSDT', 'ETHUSDT', 'BTCUSDT', 'TRXUSDT']);
    expect(applyMarketQuery(list, { ...base, sort: 'change' }).map((t) => t.symbol)).toEqual(['TRXUSDT', 'BTCUSDT', 'USDCUSDT', 'ETHUSDT']);
  });
  it('filters by search, favorites and stable category', () => {
    expect(applyMarketQuery(list, { ...base, search: 'eth' }).map((t) => t.symbol)).toEqual(['ETHUSDT']);
    expect(applyMarketQuery(list, { ...base, search: 'btc/usdt' }).map((t) => t.symbol)).toEqual(['BTCUSDT']);
    expect(applyMarketQuery(list, { ...base, category: 'favorites', favorites: ['ETHUSDT'] }).map((t) => t.symbol)).toEqual(['ETHUSDT']);
    expect(applyMarketQuery(list, { ...base, category: 'favorites' })).toEqual([]);
    expect(applyMarketQuery(list, { ...base, category: 'stable' }).map((t) => t.symbol)).toEqual(['USDCUSDT']);
  });
  it('toggles favorites and parses persisted favorites defensively', () => {
    expect(toggleFavorite(['A'], 'B')).toEqual(['A', 'B']);
    expect(toggleFavorite(['A', 'B'], 'A')).toEqual(['B']);
    expect(parseFavorites('["ETHUSDT", 3, "bad sym"]')).toEqual(['ETHUSDT']);
    expect(parseFavorites('garbage')).toEqual([]);
    expect(parseFavorites(null)).toEqual([]);
  });
});


describe('stable total (USDT units)', () => {
  const row = (symbol: string, balance: bigint | null, extra = {}) => ({ symbol, stable: true, balance, decimals: 6, ...extra });
  it('converts USDC at live rate, USDT 1:1, ignores natives/custom', () => {
    const r = stableTotalUsdt([row('USDC', 10_000_000n), row('USDT', 5_000_000n), { symbol: 'ETH', balance: 10n ** 18n, decimals: 18 }, row('USDC', 1_000_000n, { custom: true })], 1.0012);
    expect(r.value).toBeCloseTo(15.012, 6);
    expect(r.usesRate).toBe(true);
  });
  it('returns null (no fabricated $1) when USDC is held but rate unavailable', () => {
    expect(stableTotalUsdt([row('USDC', 1n)], null).value).toBeNull();
    expect(stableTotalUsdt([row('USDC', 0n), row('USDT', 2_000_000n)], null)).toEqual({ value: 2, usesRate: false });
  });
});

describe('chart path', () => {
  it('needs ≥2 points and maps min/max to the box', () => {
    expect(linePath([{ close: 1 }], 100, 50)).toBeNull();
    const p = linePath([{ close: 1 }, { close: 2 }], 100, 50, 0)!;
    expect(p.line).toBe('M0.0,50.0 L100.0,0.0');
  });
});
