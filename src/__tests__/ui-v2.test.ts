import { breakpointFor, gridColumns } from '@/components/layout';
import { alpha } from '@/constants/theme';
import { chainHealth } from '@/services/health';

describe('layout primitives', () => {
  it('classifies breakpoints', () => {
    expect(breakpointFor(320)).toBe('compact');
    expect(breakpointFor(390)).toBe('regular');
    expect(breakpointFor(768)).toBe('medium');
    expect(breakpointFor(1280)).toBe('expanded');
  });
  it('uses two columns only on wide content', () => {
    expect(gridColumns(390)).toBe(1);
    expect(gridColumns(719)).toBe(1);
    expect(gridColumns(960)).toBe(2);
  });
  it('alpha() appends a hex alpha channel', () => {
    expect(alpha('#112233', 1)).toMatch(/^#112233ff$/i);
    expect(alpha('#112233', 0)).toMatch(/^#11223300$/i);
  });
});

describe('chainHealth', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const clock = () => { let n = 1000; return () => (n += 25); };

  it('reads Tron Nile block height', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ block_header: { raw_data: { number: 123 } } }) })) as never;
    const h = await chainHealth('tronNile', clock());
    expect(h).toMatchObject({ ok: true, height: 123n, latencyMs: 25 });
  });
  it('reads Solana devnet slot', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ result: 999 }) })) as never;
    expect(await chainHealth('solanaDevnet', clock())).toMatchObject({ ok: true, height: 999n });
  });
  it('reports HTTP and RPC failures instead of throwing', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as never;
    expect(await chainHealth('tronNile')).toMatchObject({ ok: false, error: 'HTTP 503' });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ error: { message: 'rate limited' } }) })) as never;
    expect(await chainHealth('solanaDevnet')).toMatchObject({ ok: false, error: 'rate limited' });
  });
});
