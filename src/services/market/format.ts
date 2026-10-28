/** Precision + display helpers for Binance decimal strings. Pure; no float math for rounding inputs. */

/** "0.01000000" → 2; "1.00000000" → 0. */
export function decimalsFromStep(step: string | undefined): number | null {
  if (!step) return null;
  const n = Number(step);
  if (!isFinite(n) || n <= 0) return null;
  const [, f = ''] = step.split('.');
  const trimmed = f.replace(/0+$/, '');
  return trimmed.length;
}

/** Round a decimal string to `dp` places (half-up) as a string, without float error. */
export function roundDecimal(value: string, dp: number): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const neg = value.startsWith('-');
  const [i, f = ''] = value.replace('-', '').split('.');
  const frac = f.padEnd(dp + 1, '0');
  let big = BigInt(i + frac.slice(0, dp));
  if (Number(frac[dp]) >= 5) big += 1n;
  const s = big.toString().padStart(dp + 1, '0');
  const out = dp > 0 ? `${s.slice(0, -dp)}.${s.slice(-dp)}` : s;
  return neg && big !== 0n ? `-${out}` : out;
}

const group = (i: string) => i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Price at exchange tick precision (fallback: sensible significant digits). */
export function formatPrice(value: string | number | null | undefined, tickDecimals: number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const str = typeof value === 'number' ? String(value) : value;
  const n = Number(str);
  if (!isFinite(n)) return '—';
  const dp = tickDecimals ?? (n >= 1000 ? 2 : n >= 1 ? 4 : 6);
  const r = roundDecimal(/e/i.test(str) ? n.toFixed(Math.min(dp + 2, 20)) : str, dp);
  const [i, f] = r.split('.');
  return f !== undefined ? `${group(i)}.${f}` : group(i);
}

export type Direction = 'up' | 'down' | 'flat';
export const directionOf = (pct: number | null | undefined): Direction => (pct == null || !isFinite(pct) || pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down');

/** "+1.60%", "−0.42%", "0.00%" — explicit sign, typographic minus. */
export function formatPct(pct: number | null | undefined): string {
  if (pct == null || !isFinite(pct)) return '—';
  const a = Math.abs(pct).toFixed(2);
  return pct > 0 ? `+${a}%` : pct < 0 ? `\u2212${a}%` : `${a}%`;
}

export const arrowOf = (d: Direction) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '•');

/** Spoken form for screen readers. */
export function spokenPct(pct: number | null | undefined): string {
  if (pct == null || !isFinite(pct)) return 'change unavailable';
  const d = directionOf(pct);
  return d === 'flat' ? 'unchanged' : `${d} ${Math.abs(pct).toFixed(2)} percent`;
}

/** Compact volume: 1.23B, 45.6M, 7.89K. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '—';
  const a = Math.abs(value);
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  return `${(value / d).toFixed(2)}${s}`;
}
