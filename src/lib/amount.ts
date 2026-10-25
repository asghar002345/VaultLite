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
