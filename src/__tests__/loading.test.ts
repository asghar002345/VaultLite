import fs from 'node:fs';
import path from 'node:path';

import { hasData, loadPhase, singleFlight } from '@/lib/loading';

describe('loadPhase', () => {
  it('shows a skeleton only when nothing is cached', () => {
    expect(loadPhase({ isPending: true, isFetching: true })).toBe('skeleton');
    expect(loadPhase({ isPending: true, isFetching: true, data: [] })).toBe('skeleton');
  });
  it('keeps cached data on screen during a background refetch (hint, not loader)', () => {
    expect(loadPhase({ isPending: false, isFetching: true, data: [1] })).toBe('refreshing');
    expect(loadPhase({ isPending: false, isFetching: false, data: [1] })).toBe('ready');
  });
  it('a failed refetch with cached data stays on the data, not the error state', () => {
    expect(loadPhase({ isPending: false, isError: true, data: [1] })).toBe('ready');
    expect(loadPhase({ isPending: false, isError: true })).toBe('error');
  });
  it('empty after load', () => {
    expect(loadPhase({ isPending: false, data: [] })).toBe('empty');
    expect(loadPhase({ isPending: false, data: [1] }, { empty: true })).toBe('empty');
  });
  it('hasData', () => {
    expect(hasData(0)).toBe(true);
    expect(hasData(null)).toBe(false);
    expect(hasData([])).toBe(false);
  });
});

describe('singleFlight (button double-tap guard)', () => {
  it('drops taps while the first async submit is in flight', async () => {
    let resolve!: () => void;
    const fn = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const go = singleFlight(fn);
    const p = go();
    go();
    go();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(go.busy()).toBe(true);
    resolve();
    await p;
    expect(go.busy()).toBe(false);
    go();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('releases after a rejection', async () => {
    const go = singleFlight(() => Promise.reject(new Error('x')));
    await expect(go()).rejects.toThrow('x');
    expect(go.busy()).toBe(false);
  });
  it('sync handlers never lock', () => {
    const fn = jest.fn();
    const go = singleFlight(fn);
    expect(go()).toBeUndefined();
    go();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(go.busy()).toBe(false);
  });
});

/** Source audit: guards the loader conventions so new screens can't regress them. */
describe('loader conventions (source audit)', () => {
  const root = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== '__tests__') walk(p); } else if (/\.tsx$/.test(f.name)) files.push(p);
    }
  };
  walk(root);
  const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('every Button with a progress title ("…ing…") also passes loading', () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<Button\b[^>]*?title=\{[^}]*\?\s*'[^']*…'[^>]*?\/>/gs)) if (!/\bloading=/.test(m[0])) bad.push(`${path.relative(root, f)}: ${m[0].slice(0, 80)}`);
    }
    expect(bad).toEqual([]);
  });
  it('pull-to-refresh is never bound to background refetch state', () => {
    for (const f of files) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/refreshing=\{\w+\.isRefetching\}/);
  });
  it('list screens wire pull-to-refresh', () => {
    for (const p of ['app/(tabs)/home.tsx', 'app/markets/index.tsx', 'app/markets/[symbol].tsx', 'app/tokens/index.tsx', 'app/(tabs)/activity.tsx', 'app/escrow/index.tsx']) expect(src(p)).toMatch(/useRefreshControl\(/);
  });
  it('chart keeps the previous range under an overlay while the new one loads', () => {
    expect(fs.readFileSync(path.join(root, 'hooks/use-market.ts'), 'utf8')).toMatch(/placeholderData: keepPreviousData/);
    expect(src('app/markets/[symbol].tsx')).toMatch(/<LoadingOverlay active=\{switching\}/);
  });
  it('home total shows a skeleton, not 0.00, before balances load', () => {
    expect(src('app/(tabs)/home.tsx')).toMatch(/phase === 'skeleton' \? \(\s*<View testID="total-loading"/);
  });
  it('spinners respect reduced motion', () => {
    expect(src('components/ui.tsx')).toMatch(/if \(reduced\)\s*return \(\s*<View testID=\{testID\} accessibilityRole="progressbar"/);
  });
});
