/** Regression tests for QA v4.1 findings M1–M4 (docs/PHONE_TEST_v4.1.md, qa/v4.1). */
import { onlineManager } from '@tanstack/react-query';

type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };
const netListeners: ((s: NetState) => void)[] = [];
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (l: (s: NetState) => void) => { netListeners.push(l); return () => {}; } },
}));
const emitNet = (s: NetState) => netListeners.forEach((l) => l(s));

// eslint-disable-next-line import/first
import * as chart from '@/services/market/chart';
// eslint-disable-next-line import/first
import * as info from '@/services/market/exchange-info';
// eslint-disable-next-line import/first
import * as offline from '@/services/market/offline';

const candles = [1, 2, 3].map((c, i) => ({ openTime: i, open: c, high: c, low: c, close: c, volume: 1, closeTime: i }));

describe('M1: failed range switch must not show the previous range as the new one', () => {
  const phase = (chart as unknown as { chartPhase: (q: object) => string }).chartPhase;
  it('placeholder data + error → error', () => {
    expect(phase({ isPending: false, isError: true, isPlaceholderData: true, isFetching: false, data: candles })).toBe('error');
  });
  it('placeholder data while fetching → switching; fresh data → ready', () => {
    expect(phase({ isPending: false, isError: false, isPlaceholderData: true, isFetching: true, data: candles })).toBe('switching');
    expect(phase({ isPending: false, isError: false, isPlaceholderData: false, isFetching: false, data: candles })).toBe('ready');
    expect(phase({ isPending: true, isError: false, isPlaceholderData: false, isFetching: true, data: undefined })).toBe('skeleton');
  });
});

describe('M2: corrupt or ancient exchangeInfo cache never masks the network error', () => {
  const load = (info as unknown as { loadInfoWithCache: (d: object) => Promise<unknown> }).loadInfoWithCache;
  const netErr = new Error('network down');
  const deps = (raw: string | null, now = 1_000_000_000) => ({
    load: () => Promise.reject(netErr),
    getItem: async () => raw,
    setItem: async () => {},
    now: () => now,
  });
  it('corrupt JSON → original error, not SyntaxError', async () => {
    await expect(load(deps('{corrupt'))).rejects.toBe(netErr);
  });
  it('cache older than max age → original error', async () => {
    const raw = JSON.stringify({ at: 0, info: { BTCUSDT: { status: 'TRADING' } } });
    await expect(load(deps(raw, 30 * 24 * 3600_000))).rejects.toBe(netErr);
  });
  it('fresh cache is used offline', async () => {
    const raw = JSON.stringify({ at: 0, info: { BTCUSDT: { status: 'TRADING' } } });
    await expect(load(deps(raw, 3600_000))).resolves.toEqual({ BTCUSDT: { status: 'TRADING' } });
  });
});

describe('M3 + M4: offline signal', () => {
  beforeAll(() => {
    const bind = (offline as unknown as { bindOnlineManager?: (om: typeof onlineManager) => () => void }).bindOnlineManager;
    bind?.(onlineManager);
    offline.subscribeOffline(() => {});
  });
  afterEach(() => emitNet({ isConnected: true, isInternetReachable: true }));

  it('M4: connected but internet unreachable counts as offline', () => {
    emitNet({ isConnected: true, isInternetReachable: false });
    expect(offline.isOffline()).toBe(true);
  });
  it('M4: unknown reachability (null) is not offline', () => {
    emitNet({ isConnected: true, isInternetReachable: null });
    expect(offline.isOffline()).toBe(false);
  });
  it('M3: React Query onlineManager follows the offline signal (pauses polling/retries)', () => {
    emitNet({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    emitNet({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
