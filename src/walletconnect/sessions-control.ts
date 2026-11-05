/**
 * Pure helpers for the connected-apps screen. WalletKit I/O stays in walletkit.ts;
 * these functions are what the Jest tests exercise.
 */

export interface WalletSession {
  topic: string;
  expiry: number;
  peer: { metadata: { name: string; description?: string; url: string; icons: string[] } };
  namespaces: Record<string, { chains?: string[]; accounts: string[] }>;
}

export interface ConnectedApp {
  topic: string;
  name: string;
  url: string;
  icon: string | null;
  chains: string[];
  /** Unix ms when this topic was first seen, or null if not recorded yet. */
  connectedAt: number | null;
  expiry: number;
}

export interface DisconnectResult {
  disconnected: string[];
  failed: { topic: string; message: string }[];
}

const CONNECTED_AT_KEY = 'vaultlite.wc.connectedAt.v1';

export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function sessionChains(session: WalletSession): string[] {
  const out: string[] = [];
  for (const ns of Object.values(session.namespaces)) {
    const chains = ns.chains?.length ? ns.chains : ns.accounts.map((a) => a.split(':').slice(0, 2).join(':'));
    for (const c of chains) if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function toConnectedApp(session: WalletSession, connectedAt: number | null): ConnectedApp {
  const icons = session.peer.metadata.icons ?? [];
  return {
    topic: session.topic,
    name: session.peer.metadata.name?.trim() || 'Unnamed dApp',
    url: session.peer.metadata.url?.trim() || '',
    icon: icons.find((u) => /^https?:\/\//i.test(u)) ?? null,
    chains: sessionChains(session),
    connectedAt,
    expiry: session.expiry,
  };
}

export function toConnectedApps(sessions: WalletSession[], connectedAt: Record<string, number>): ConnectedApp[] {
  return sessions.map((s) => toConnectedApp(s, connectedAt[s.topic] ?? null));
}

/** Relative label for when the session was first observed. `now` is injected so tests stay stable. */
export function formatConnectedAt(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Remember the first time each live topic was seen. Existing timestamps are kept.
 * Topics that are no longer active are dropped.
 */
export async function rememberConnectedAt(topics: string[], store: Kv, now = Date.now()): Promise<Record<string, number>> {
  let map: Record<string, number> = {};
  try {
    const raw = await store.get(CONNECTED_AT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed as Record<string, number>;
  } catch {
    map = {};
  }
  const live = new Set(topics);
  const next: Record<string, number> = {};
  for (const topic of live) {
    const prev = map[topic];
    next[topic] = typeof prev === 'number' && Number.isFinite(prev) ? prev : now;
  }
  const changed = Object.keys(map).length !== Object.keys(next).length || topics.some((t) => map[t] !== next[t]);
  if (changed) await store.set(CONNECTED_AT_KEY, JSON.stringify(next));
  return next;
}

export function topicsToDisconnect(topics: string[], which: string | 'all'): string[] {
  if (which === 'all') return [...topics];
  return topics.includes(which) ? [which] : [];
}

/** Disconnect each topic. A failure is recorded and the rest still run. */
export async function disconnectSessions(topics: string[], disconnectOne: (topic: string) => Promise<void>): Promise<DisconnectResult> {
  const disconnected: string[] = [];
  const failed: { topic: string; message: string }[] = [];
  for (const topic of topics) {
    try {
      await disconnectOne(topic);
      disconnected.push(topic);
    } catch (e) {
      failed.push({ topic, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { disconnected, failed };
}

export function sessionsAfterDisconnect<T extends { topic: string }>(sessions: T[], disconnected: string[]): T[] {
  const drop = new Set(disconnected);
  return sessions.filter((s) => !drop.has(s.topic));
}

export const connectedAtStorageKey = CONNECTED_AT_KEY;
