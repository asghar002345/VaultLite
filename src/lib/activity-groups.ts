/** Pure helpers for the Activity screen: filter chips and day grouping. */
export type ActivityFilter = 'all' | 'sent' | 'received' | 'pending';

export interface ActivityItem {
  at: number;
  direction: 'out' | 'in';
  pending: boolean;
}

export function matchesFilter(r: ActivityItem, f: ActivityFilter) {
  return f === 'all' || (f === 'sent' && r.direction === 'out') || (f === 'received' && r.direction === 'in') || (f === 'pending' && r.pending);
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Group (already newest-first) rows by local calendar day with Today / Yesterday / "Mon, Oct 19" labels. */
export function groupByDay<R extends { at: number }>(rows: R[], now: number): { key: string; label: string; items: R[] }[] {
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  const out: { key: string; label: string; items: R[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.at);
    let g = out[out.length - 1];
    if (!g || g.key !== k) {
      const label = k === today ? 'Today' : k === yesterday ? 'Yesterday' : new Date(r.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      g = { key: k, label, items: [] };
      out.push(g);
    }
    g.items.push(r);
  }
  return out;
}
