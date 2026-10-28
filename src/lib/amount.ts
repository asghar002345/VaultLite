import { formatUnits, parseUnits } from 'viem';

/** Parse a user-entered decimal amount; null if malformed, zero, or too many decimals. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const v = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  if ((v.split('.')[1]?.length ?? 0) > decimals) return null;
  const n = parseUnits(v, decimals);
  return n > 0n ? n : null;
}

/** Demo total: stablecoins at $1, natives unpriced. */
export function stableTotal(list: { stable?: boolean; balance: bigint | null; decimals: number }[]): number {
  return list.reduce((sum, t) => (t.stable && t.balance !== null ? sum + Number(formatUnits(t.balance, t.decimals)) : sum), 0);
}

/**
 * Home total for TEST stablecoins in USDT units (Phase 2 decision 4): USDT counts 1:1 (it is the
 * quote unit), USDC is converted at the live Binance USDC/USDT rate. Natives are never priced.
 * If any USDC is held and the rate is unavailable, the total is null — never a guessed $1.
 */
export function stableTotalUsdt(
  list: { symbol: string; stable?: boolean; custom?: boolean; balance: bigint | null; decimals: number }[],
  usdcRate: number | null,
): { value: number | null; usesRate: boolean } {
  let sum = 0;
  let usesRate = false;
  for (const t of list) {
    if (!t.stable || t.custom || t.balance === null) continue;
    const amt = Number(formatUnits(t.balance, t.decimals));
    if (t.symbol === 'USDT') sum += amt;
    else if (t.symbol === 'USDC') {
      if (amt === 0) continue;
      usesRate = true;
      if (usdcRate === null || !isFinite(usdcRate)) return { value: null, usesRate };
      sum += amt * usdcRate;
    }
  }
  return { value: sum, usesRate };
}
