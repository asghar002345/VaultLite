/**
 * Binance public spot market data over REST. No API keys, no signed or trading endpoints.
 * Host order: data-api.binance.vision (market-data-only) first, api.binance.com fallback.
 */
export const REST_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'] as const;

export class MarketHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
    this.name = 'MarketHttpError';
  }
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; headers: { get(k: string): string | null } }>;

let preferred = 0;
/** Rate-limit cooldown (epoch ms) set from Retry-After on 429/418; requests fail fast until then. */
let blockedUntil = 0;
/** Testing hook. */
export const resetHostPreference = () => {
  preferred = 0;
  blockedUntil = 0;
};
export const rateLimitedUntil = () => blockedUntil;

/** Retry-After header (seconds, or HTTP-date) → ms; default 60s for 429, 2 min for 418 (IP ban escalates). */
export function parseRetryAfter(h: string | null, status: number, now = Date.now()): number {
  const fallback = status === 418 ? 120_000 : 60_000;
  if (!h) return fallback;
  const secs = Number(h);
  if (isFinite(secs) && secs > 0) return secs * 1000;
  const at = Date.parse(h);
  return isFinite(at) && at > now ? at - now : fallback;
}

/** React Query retry policy: honour Retry-After for rate limits (one retry), don't retry 400/451, else up to 2. */
export function marketRetry(failureCount: number, err: unknown): boolean {
  if (err instanceof MarketHttpError) {
    if (err.status === 429 || err.status === 418) return failureCount < 1;
    if (err.status === 400 || err.status === 451) return false;
  }
  return failureCount < 2;
}
export function marketRetryDelay(attempt: number, err: unknown): number {
  if (err instanceof MarketHttpError && err.retryAfterMs) return err.retryAfterMs;
  return Math.min(30_000, 1000 * 2 ** attempt);
}
export const currentHost = () => REST_HOSTS[preferred];

/** GET path on the preferred host; on network error / 451 / 403 / 5xx try the other host. 429/418 are surfaced (back off, don't hammer). */
export async function binanceGet<T>(path: string, opts: { signal?: AbortSignal; fetchImpl?: Fetch; timeoutMs?: number; now?: () => number } = {}): Promise<T> {
  const f: Fetch = opts.fetchImpl ?? (globalThis.fetch as unknown as Fetch);
  const now = opts.now ?? Date.now;
  if (blockedUntil > now()) throw new MarketHttpError(429, 'Binance rate limit reached. Retrying shortly.', blockedUntil - now());
  let lastErr: unknown;
  for (let n = 0; n < REST_HOSTS.length; n++) {
    const idx = (preferred + n) % REST_HOSTS.length;
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await f(`${REST_HOSTS[idx]}${path}`, { signal: ctl.signal });
      if (res.ok) {
        preferred = idx;
        return (await res.json()) as T;
      }
      if (res.status === 429 || res.status === 418) {
        const wait = parseRetryAfter(res.headers.get('retry-after'), res.status, now());
        blockedUntil = now() + wait;
        throw new MarketHttpError(res.status, res.status === 418 ? 'Binance temporarily blocked requests from this device. Retrying later.' : 'Binance rate limit reached. Retrying shortly.', wait);
      }
      if (res.status === 400) throw new MarketHttpError(400, 'Binance rejected the request (unknown symbol?)');
      lastErr = new MarketHttpError(res.status, res.status === 451 ? 'Binance is unavailable from this location' : `Binance HTTP ${res.status}`);
    } catch (e) {
      if (e instanceof MarketHttpError && (e.status === 429 || e.status === 418 || e.status === 400)) throw e;
      if (opts.signal?.aborted) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Binance market data unavailable');
}

const enc = (symbols: readonly string[]) => encodeURIComponent(JSON.stringify(symbols));

export interface SymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize?: string;
  stepSize?: string;
}

interface RawExchangeInfo {
  symbols: { symbol: string; status: string; baseAsset: string; quoteAsset: string; filters: { filterType: string; tickSize?: string; stepSize?: string }[] }[];
}

export function parseExchangeInfo(raw: RawExchangeInfo): Record<string, SymbolInfo> {
  const out: Record<string, SymbolInfo> = {};
  for (const s of raw.symbols ?? []) {
    out[s.symbol] = {
      symbol: s.symbol,
      status: s.status,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      tickSize: s.filters.find((x) => x.filterType === 'PRICE_FILTER')?.tickSize,
      stepSize: s.filters.find((x) => x.filterType === 'LOT_SIZE')?.stepSize,
    };
  }
  return out;
}

export async function getExchangeInfo(symbols: readonly string[], o?: Parameters<typeof binanceGet>[1]) {
  return parseExchangeInfo(await binanceGet<RawExchangeInfo>(`/api/v3/exchangeInfo?symbols=${enc(symbols)}&showPermissionSets=false`, o));
}

/** Normalised quote. Strings kept for prices (formatting at tick precision), numbers for sort/compare. */
export interface Ticker {
  symbol: string;
  last: string;
  changePct: number;
  high: string;
  low: string;
  baseVolume: string;
  quoteVolume: number;
  bid: string | null;
  ask: string | null;
  /** Exchange event/close time (ms). */
  eventTime: number;
  /** Local receipt time (ms) — drives stale detection. */
  receivedAt: number;
  source: 'rest' | 'ws';
}

interface Raw24h { symbol: string; lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; volume: string; quoteVolume: string; bidPrice?: string; askPrice?: string; closeTime: number }

export function parse24h(r: Raw24h, now: number): Ticker {
  return {
    symbol: r.symbol,
    last: r.lastPrice,
    changePct: Number(r.priceChangePercent),
    high: r.highPrice,
    low: r.lowPrice,
    baseVolume: r.volume,
    quoteVolume: Number(r.quoteVolume),
    bid: r.bidPrice ?? null,
    ask: r.askPrice ?? null,
    eventTime: r.closeTime,
    receivedAt: now,
    source: 'rest',
  };
}

/** GET /api/v3/ticker/24hr?symbols=[...] (FULL type includes bid/ask). */
export async function get24h(symbols: readonly string[], o?: Parameters<typeof binanceGet>[1], now = Date.now): Promise<Ticker[]> {
  const raw = await binanceGet<Raw24h[]>(`/api/v3/ticker/24hr?symbols=${enc(symbols)}`, o);
  const t = now();
  return raw.map((r) => parse24h(r, t));
}

export interface Candle { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number }
export type KlineInterval = '15m' | '1h' | '4h' | '1d' | '1w';
export const INTERVALS: { key: KlineInterval; label: string; limit: number }[] = [
  { key: '15m', label: '1D', limit: 96 },
  { key: '1h', label: '1W', limit: 168 },
  { key: '4h', label: '1M', limit: 180 },
  { key: '1d', label: '1Y', limit: 365 },
  { key: '1w', label: '5Y', limit: 260 },
];

export function parseKlines(raw: unknown[][]): Candle[] {
  return raw.map((k) => ({ openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), closeTime: Number(k[6]) }));
}

/** GET /api/v3/klines */
export async function getKlines(symbol: string, interval: KlineInterval, limit: number, o?: Parameters<typeof binanceGet>[1]) {
  return parseKlines(await binanceGet<unknown[][]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, o));
}
