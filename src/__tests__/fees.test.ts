import { parseAmount, stableTotal } from '@/lib/amount';
import { canAfford, expectedFeeCost, feeTiers, maxFeeCost, MIN_TIP, padGas } from '@/lib/fees';

const gwei = (n: number) => BigInt(Math.round(n * 1e9));

describe('EIP-1559 fee tiers', () => {
  const t = feeTiers(gwei(10), gwei(2));
  it('computes maxFee = ceil(base × headroom) + tip per tier', () => {
    expect(t.slow).toEqual({ tier: 'slow', maxPriorityFeePerGas: gwei(1.6), maxFeePerGas: gwei(11) + gwei(1.6) });
    expect(t.normal).toEqual({ tier: 'normal', maxPriorityFeePerGas: gwei(2), maxFeePerGas: gwei(12.5) + gwei(2) });
    expect(t.fast).toEqual({ tier: 'fast', maxPriorityFeePerGas: gwei(3), maxFeePerGas: gwei(20) + gwei(3) });
  });
  it('is monotonic slow ≤ normal ≤ fast and maxFee ≥ tip', () => {
    expect(t.slow.maxFeePerGas <= t.normal.maxFeePerGas && t.normal.maxFeePerGas <= t.fast.maxFeePerGas).toBe(true);
    Object.values(t).forEach((q) => expect(q.maxFeePerGas >= q.maxPriorityFeePerGas).toBe(true));
  });
  it('floors a zero tip and handles zero base fee', () => {
    const z = feeTiers(0n, 0n);
    expect(z.slow.maxPriorityFeePerGas).toBe(MIN_TIP);
    expect(z.fast.maxFeePerGas).toBe(MIN_TIP);
  });
  it('rounds up (never under-pays) on odd wei values', () => {
    expect(feeTiers(1n, 10n).normal.maxFeePerGas).toBe(2n + MIN_TIP);
  });
  it('rejects negative inputs', () => {
    expect(() => feeTiers(-1n, 0n)).toThrow();
  });
});

describe('fee cost helpers', () => {
  const q = feeTiers(gwei(10), gwei(2)).normal;
  it('max cost = gasLimit × maxFee', () => expect(maxFeeCost(21000n, q)).toBe(21000n * gwei(14.5)));
  it('expected cost uses base + tip, capped at maxFee', () => {
    expect(expectedFeeCost(21000n, gwei(10), q)).toBe(21000n * gwei(12));
    expect(expectedFeeCost(21000n, gwei(100), q)).toBe(21000n * q.maxFeePerGas);
  });
  it('pads gas by 20% rounding up', () => {
    expect(padGas(21000n)).toBe(25200n);
    expect(padGas(1n)).toBe(2n);
  });
  it('affordability includes value for native sends only', () => {
    expect(canAfford(100n, 40n, 60n)).toBe(true);
    expect(canAfford(100n, 41n, 60n)).toBe(false);
    expect(canAfford(100n, 100n)).toBe(true);
  });
});

describe('amount parsing', () => {
  it('parses decimals and commas', () => {
    expect(parseAmount('1.5', 6)).toBe(1_500_000n);
    expect(parseAmount('0,25', 18)).toBe(250_000_000_000_000_000n);
  });
  it.each(['', '0', '-1', '1e3', 'abc', '1.1234567'])('rejects %p (6 decimals)', (v) => {
    expect(parseAmount(v, 6)).toBeNull();
  });
  it('sums stablecoins only, skipping errors', () => {
    expect(stableTotal([
      { stable: true, balance: 1_500_000n, decimals: 6 },
      { stable: false, balance: 10n ** 18n, decimals: 18 },
      { stable: true, balance: null, decimals: 6 },
    ])).toBe(1.5);
  });
});
