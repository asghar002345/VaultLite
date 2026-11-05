/**
 * Loading policy shared by every screen (pure, unit-tested).
 * - 'skeleton'  : nothing cached yet → show skeleton placeholders.
 * - 'refreshing': cached data is on screen and a background fetch runs → keep data, show a quiet hint.
 * - 'error'     : nothing to show and the fetch failed.
 * - 'empty'     : loaded, nothing to show.
 * - 'ready'     : data on screen, idle.
 * Cached data never gets replaced by a loader.
 */
export type LoadPhase = 'skeleton' | 'refreshing' | 'error' | 'empty' | 'ready';

export interface QueryLike {
  isPending: boolean;
  isFetching?: boolean;
  isError?: boolean;
  data?: unknown;
}

export function hasData(data: unknown): boolean {
  if (data === undefined || data === null) return false;
  if (Array.isArray(data)) return data.length > 0;
  return true;
}

export function loadPhase(q: QueryLike, opts: { empty?: boolean } = {}): LoadPhase {
  const cached = hasData(q.data);
  if (cached) {
    if (opts.empty) return 'empty';
    return q.isFetching ? 'refreshing' : 'ready';
  }
  if (q.isError) return 'error';
  if (q.isPending || q.isFetching) return 'skeleton';
  return 'empty';
}

/**
 * Single-flight guard for async submits: a second call while the first promise is unsettled is dropped.
 * Works synchronously, so two taps in the same frame (before React re-renders `disabled`) can't double-submit.
 */
export function singleFlight<A extends unknown[]>(fn: (...a: A) => unknown) {
  let inFlight = false;
  const run = (...a: A): Promise<void> | void => {
    if (inFlight) return;
    const r = fn(...a);
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      inFlight = true;
      return Promise.resolve(r).then(
        () => { inFlight = false; },
        (e) => { inFlight = false; throw e; },
      );
    }
  };
  return Object.assign(run, { busy: () => inFlight });
}
