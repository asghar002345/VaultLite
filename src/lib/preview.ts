/** Pure: the Home preview — non-zero balances first (stable order otherwise), capped at `max`. */
export function previewRows<R extends { balance: bigint | null }>(rows: R[], max = 4): R[] {
  const withIdx = rows.map((r, i) => ({ r, i }));
  withIdx.sort((a, b) => Number((b.r.balance ?? 0n) > 0n) - Number((a.r.balance ?? 0n) > 0n) || a.i - b.i);
  return withIdx.slice(0, max).map((x) => x.r);
}
