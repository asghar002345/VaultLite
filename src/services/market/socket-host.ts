/**
 * App-wide singleton around MarketSocket: ref-counted stream subscriptions, AppState background
 * pause, NetInfo offline pause, and a status store for UI. Pushes into React Query via `sink`.
 */
import { MarketSocket, type SocketStatus, type WebSocketCtor } from './binance-ws';
import type { Candle, KlineInterval, Ticker } from './binance-rest';

type Sink = { ticker: (t: Ticker) => void; kline: (s: string, i: KlineInterval, c: Candle) => void };

let socket: MarketSocket | null = null;
let sink: Sink | null = null;
const refs = new Map<string, number>();
let status: SocketStatus = 'idle';
const listeners = new Set<() => void>();
let apply: ReturnType<typeof setTimeout> | null = null;
let background = false;
let offline = false;

function ensure(): MarketSocket | null {
  if (socket) return socket;
  const WS = (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;
  if (!WS || !sink) return null;
  socket = new MarketSocket({
    WebSocketImpl: WS,
    onTicker: (t) => sink?.ticker(t),
    onKline: (s, i, c) => sink?.kline(s, i, c),
    onStatus: (s) => {
      status = s;
      listeners.forEach((l) => l());
    },
  });
  return socket;
}

/** Debounced so mounting several rows yields one connection. */
function schedule() {
  if (apply) clearTimeout(apply);
  apply = setTimeout(() => {
    apply = null;
    const s = ensure();
    if (!s) return;
    s.setStreams([...refs.keys()]);
    if (background || offline) s.pause();
    else s.resume();
  }, 250);
}

export function setMarketSink(s: Sink | null) {
  sink = s;
  if (!s) {
    socket?.close();
    socket = null;
    status = 'closed';
    listeners.forEach((l) => l());
  } else schedule();
}

/** Subscribe streams; returns the release fn (call on unmount). */
export function retainStreams(streams: string[]): () => void {
  streams.forEach((s) => refs.set(s, (refs.get(s) ?? 0) + 1));
  schedule();
  return () => {
    streams.forEach((s) => {
      const n = (refs.get(s) ?? 1) - 1;
      if (n <= 0) refs.delete(s);
      else refs.set(s, n);
    });
    schedule();
  };
}

export function setBackground(v: boolean) {
  background = v;
  schedule();
}
export function setOffline(v: boolean) {
  offline = v;
  schedule();
}

export const getSocketStatus = () => status;
export function subscribeSocketStatus(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
/** Test hook. */
export const _activeStreams = () => [...refs.keys()];
