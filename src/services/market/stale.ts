/** Freshness policy for market quotes. */
export const REFETCH_AFTER_MS = 30_000;
export const STALE_AFTER_MS = 120_000;

export type Freshness = 'live' | 'lagging' | 'stale' | 'none';

/** live < 30s; lagging 30–120s (trigger REST refetch, still shown); stale ≥ 120s (labelled, never shown as live). */
export function freshnessOf(receivedAt: number | null | undefined, now: number): Freshness {
  if (!receivedAt) return 'none';
  const age = now - receivedAt;
  if (age < REFETCH_AFTER_MS) return 'live';
  if (age < STALE_AFTER_MS) return 'lagging';
  return 'stale';
}

export const needsRefetch = (receivedAt: number | null | undefined, now: number) => freshnessOf(receivedAt, now) !== 'live';

/** "hh:mm" local time label for "updated" captions. */
export function clockLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
