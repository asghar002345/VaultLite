/**
 * Binance public market streams (combined stream endpoint), throttled, with reconnect + backoff.
 * Raw-market data only: <symbol>@ticker (24h rolling incl. best bid/ask) and <symbol>@kline_<interval>.
 */
import type { Candle, KlineInterval, Ticker } from './binance-rest';

export const WS_HOSTS = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'] as const;

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'paused' | 'closed';

export interface MinimalWebSocket {
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: ((e: unknown) => void) | null;
  close(): void;
}
export type WebSocketCtor = new (url: string) => MinimalWebSocket;

export interface SocketDeps {
  WebSocketImpl: WebSocketCtor;
  onTicker: (t: Ticker) => void;
  onKline?: (symbol: string, interval: KlineInterval, c: Candle) => void;
  onStatus?: (s: SocketStatus) => void;
  now?: () => number;
  random?: () => number;
  /** UI flush cadence per symbol (ms). */
  throttleMs?: number;
  /** No message for this long ⇒ treat connection as dead. */
  idleTimeoutMs?: number;
}

/** Exponential backoff with full-ish jitter: 1s, 2s, 4s … capped at 30s, ×[0.5, 1). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.5 + random() * 0.5));
}

export function streamUrl(host: string, streams: string[]) {
  return `${host}/stream?streams=${streams.join('/')}`;
}

export const tickerStream = (symbol: string) => `${symbol.toLowerCase()}@ticker`;
export const klineStream = (symbol: string, i: KlineInterval) => `${symbol.toLowerCase()}@kline_${i}`;

interface RawTickerEvt { e: '24hrTicker'; E: number; s: string; c: string; P: string; h: string; l: string; v: string; q: string; b: string; a: string }
interface RawKlineEvt { e: 'kline'; E: number; s: string; k: { t: number; T: number; i: KlineInterval; o: string; h: string; l: string; c: string; v: string } }

export function parseTickerEvent(d: RawTickerEvt, now: number): Ticker {
  return { symbol: d.s, last: d.c, changePct: Number(d.P), high: d.h, low: d.l, baseVolume: d.v, quoteVolume: Number(d.q), bid: d.b, ask: d.a, eventTime: d.E, receivedAt: now, source: 'ws' };
}

export class MarketSocket {
  private ws: MinimalWebSocket | null = null;
  private streams: string[] = [];
  private attempt = 0;
  private hostIdx = 0;
  private paused = false;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lifeTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, Ticker>();
  private status: SocketStatus = 'idle';
  private d: Required<Omit<SocketDeps, 'onKline' | 'onStatus'>> & Pick<SocketDeps, 'onKline' | 'onStatus'>;

  constructor(deps: SocketDeps) {
    this.d = { now: Date.now, random: Math.random, throttleMs: 1000, idleTimeoutMs: 60_000, ...deps };
  }

  getStatus = () => this.status;
  getStreams = () => [...this.streams];

  private setStatus(s: SocketStatus) {
    if (this.status === s) return;
    this.status = s;
    this.d.onStatus?.(s);
  }

  /** Replace the stream set; reconnects only if it changed. Empty set ⇒ disconnect. */
  setStreams(next: string[]) {
    const uniq = [...new Set(next)].sort();
    if (uniq.join('/') === this.streams.join('/')) return;
    this.streams = uniq;
    this.teardown();
    if (!uniq.length) return this.setStatus('idle');
    this.attempt = 0;
    this.connect();
  }

  pause() {
    this.paused = true;
    this.teardown();
    this.setStatus('paused');
  }

  resume() {
    if (!this.paused || this.closed) return;
    this.paused = false;
    this.attempt = 0;
    if (this.streams.length) this.connect();
    else this.setStatus('idle');
  }

  close() {
    this.closed = true;
    this.teardown();
    this.pending.clear();
    this.setStatus('closed');
  }

  private clear(t: ReturnType<typeof setTimeout> | null) {
    if (t) clearTimeout(t);
  }

  private teardown() {
    this.clear(this.reconnectTimer);
    this.clear(this.idleTimer);
    this.clear(this.lifeTimer);
    this.clear(this.flushTimer);
    this.reconnectTimer = this.idleTimer = this.lifeTimer = this.flushTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {}
    }
  }

  private connect() {
    if (this.closed || this.paused || !this.streams.length) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new this.d.WebSocketImpl(streamUrl(WS_HOSTS[this.hostIdx], this.streams));
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('open');
      this.armIdle();
      // Binance closes connections at 24h; rotate a bit earlier.
      this.lifeTimer = setTimeout(() => this.restart(false), 23 * 3600_000);
    };
    ws.onmessage = (e) => {
      this.armIdle();
      this.handle(e.data);
    };
    ws.onerror = () => {};
    ws.onclose = () => this.restart(true);
  }

  /** Drop the socket and schedule a reconnect (with backoff when it failed). */
  private restart(failed: boolean) {
    this.teardown();
    if (this.closed || this.paused || !this.streams.length) return;
    if (failed) {
      this.attempt += 1;
      if (this.attempt % 2 === 0) this.hostIdx = (this.hostIdx + 1) % WS_HOSTS.length;
    }
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), failed ? backoffMs(this.attempt - 1, this.d.random) : 0);
  }

  private armIdle() {
    this.clear(this.idleTimer);
    this.idleTimer = setTimeout(() => this.restart(true), this.d.idleTimeoutMs);
  }

  private handle(raw: unknown) {
    let msg: { stream?: string; data?: RawTickerEvt | RawKlineEvt };
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof msg);
    } catch {
      return;
    }
    const d = msg?.data;
    if (!d || typeof d !== 'object') return;
    if (d.e === '24hrTicker') {
      this.pending.set(d.s, parseTickerEvent(d, this.d.now()));
      if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), this.d.throttleMs);
    } else if (d.e === 'kline' && this.d.onKline) {
      const k = d.k;
      this.d.onKline(d.s, k.i, { openTime: k.t, closeTime: k.T, open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v) });
    }
  }

  private flush() {
    this.flushTimer = null;
    const batch = [...this.pending.values()];
    this.pending.clear();
    batch.forEach((t) => this.d.onTicker(t));
  }
}
