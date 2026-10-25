import { formatUnits } from 'viem';

export function formatAmount(raw: bigint, decimals: number, maxFrac = 6): string {
  const s = formatUnits(raw, decimals);
  const [i, f = ''] = s.split('.');
  const frac = f.slice(0, maxFrac).replace(/0+$/, '');
  return frac ? `${i}.${frac}` : i;
}

export const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
