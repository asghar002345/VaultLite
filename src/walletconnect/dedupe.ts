/**
 * Drop repeat session requests: the relay can redeliver the same id (reconnects, app resume),
 * and some dApps fire the identical request twice on double-click.
 */
export function createRequestDeduper(windowMs = 5000, now: () => number = Date.now) {
  const seenIds = new Set<string>();
  const recent = new Map<string, number>();
  return (r: { id: number; topic: string; method: string; params: unknown; chainId: string }): boolean => {
    const idKey = `${r.topic}:${r.id}`;
    if (seenIds.has(idKey)) return true;
    seenIds.add(idKey);
    const t = now();
    for (const [k, at] of recent) if (t - at > windowMs) recent.delete(k);
    const payloadKey = `${r.topic}|${r.chainId}|${r.method}|${JSON.stringify(r.params)}`;
    if (recent.has(payloadKey)) return true;
    recent.set(payloadKey, t);
    return false;
  };
}
