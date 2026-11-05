import type { WithSpringConfig } from 'react-native-reanimated';

/** Motion tokens — docs/DESIGN.md §3. */
export const Springs = {
  snappy: { damping: 18, stiffness: 320, mass: 1 },
  gentle: { damping: 16, stiffness: 160, mass: 1 },
  bouncy: { damping: 10, stiffness: 180, mass: 1 },
} satisfies Record<string, WithSpringConfig>;

export const Durations = { fast: 140, base: 240, slow: 420, count: 900, hold: 1500 } as const;
export const STAGGER_MS = 40;
export const MAX_STAGGER = 8;

/** Pure helper (unit-tested): stagger delay for item i. */
export const staggerDelay = (i: number) => Math.min(Math.max(i, 0), MAX_STAGGER) * STAGGER_MS;

