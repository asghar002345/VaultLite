/** Pure settings model (unit-tested). Persistence lives in settings.ts. */
export type ThemePref = 'system' | 'dark' | 'light';

export const AUTO_LOCK_OPTIONS = [
  { ms: 0, label: 'Immediately' },
  { ms: 30_000, label: 'After 30 seconds' },
  { ms: 60_000, label: 'After 1 minute' },
  { ms: 300_000, label: 'After 5 minutes' },
  { ms: 900_000, label: 'After 15 minutes' },
] as const;

export interface AppSettings {
  v: 1;
  theme: ThemePref;
  /** Lock after the app has been in the background this long. 0 = on background. */
  autoLockMs: number;
  /** Chain keys hidden from the home token list. */
  hiddenChains: string[];
}

export const DEFAULT_SETTINGS: AppSettings = { v: 1, theme: 'system', autoLockMs: 0, hiddenChains: [] };

/** Parse persisted JSON defensively; unknown/invalid fields fall back to defaults. */
export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const o = JSON.parse(raw) as Partial<AppSettings>;
    return {
      v: 1,
      theme: o.theme === 'dark' || o.theme === 'light' || o.theme === 'system' ? o.theme : DEFAULT_SETTINGS.theme,
      autoLockMs: AUTO_LOCK_OPTIONS.some((x) => x.ms === o.autoLockMs) ? (o.autoLockMs as number) : DEFAULT_SETTINGS.autoLockMs,
      hiddenChains: Array.isArray(o.hiddenChains) ? o.hiddenChains.filter((c): c is string => typeof c === 'string') : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Auto-lock decision when the app returns to the foreground.
 * `backgroundedAt` null = never left foreground. Clock going backwards → lock (fail safe).
 */
export function shouldAutoLock(backgroundedAt: number | null, now: number, autoLockMs: number): boolean {
  if (backgroundedAt === null) return false;
  const elapsed = now - backgroundedAt;
  if (elapsed < 0) return true;
  return elapsed >= autoLockMs;
}

export function autoLockLabel(ms: number) {
  return AUTO_LOCK_OPTIONS.find((o) => o.ms === ms)?.label ?? `${Math.round(ms / 1000)} s`;
}

export const resolveScheme = (pref: ThemePref, system: 'light' | 'dark' | null | undefined): 'light' | 'dark' =>
  pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
