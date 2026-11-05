import { formatFixed } from '@/lib/format-fixed';
import { Colors } from '@/constants/theme';
import { Durations, MAX_STAGGER, STAGGER_MS, Springs, staggerDelay } from '@/motion/tokens';

describe('motion tokens', () => {
  it('caps stagger', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(3 * STAGGER_MS);
    expect(staggerDelay(99)).toBe(MAX_STAGGER * STAGGER_MS);
    expect(staggerDelay(-2)).toBe(0);
  });
  it('springs are damped and durations sane', () => {
    Object.values(Springs).forEach((s) => expect(s.damping).toBeGreaterThan(0));
    expect(Durations.fast).toBeLessThan(Durations.base);
    expect(Durations.base).toBeLessThan(Durations.slow);
  });
});

describe('count-up formatter', () => {
  it('groups thousands and keeps decimals', () => {
    expect(formatFixed(1234567.891, 2, '$')).toBe('$1,234,567.89');
    expect(formatFixed(0, 2, '$')).toBe('$0.00');
    expect(formatFixed(999.5, 0, '')).toBe('1,000');
  });
});

describe('theme tokens', () => {
  it('dark and light expose the same keys', () => {
    expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
  });
});
