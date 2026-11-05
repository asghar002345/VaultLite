import { breakpointFor, gridColumns } from '@/components/layout';
import { alpha } from '@/constants/theme';
import { chainHealth } from '@/services/health';
import { createQueue, presentationFor } from '@/walletconnect/queue';
import { actionKey, describeAction, parseActionKey, type Escrow } from '@/modules/escrow';

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


describe('WalletConnect request queue', () => {
  const item = (id: number, kind: string) => ({ request: { id } as never, analysis: { kind } as never, peer: { name: 'd', url: 'u' } });
  it('routes quick vs complex requests', () => {
    expect(presentationFor('personal_sign')).toBe('sheet');
    expect(presentationFor('tron_sign_message')).toBe('sheet');
    expect(presentationFor('typed_data')).toBe('screen');
    expect(presentationFor('send_tx')).toBe('screen');
    expect(presentationFor('tron_sign_tx')).toBe('screen');
  });
  it('is FIFO, ignores duplicate ids and notifies subscribers', () => {
    const q = createQueue();
    const f = jest.fn();
    q.subscribe(f);
    q.push(item(1, 'send_tx'));
    q.push(item(2, 'personal_sign'));
    q.push(item(1, 'send_tx'));
    expect(q.all().map((x) => x.request.id)).toEqual([1, 2]);
    expect(q.head()?.request.id).toBe(1);
    q.remove(1);
    q.remove(99);
    expect(q.head()?.request.id).toBe(2);
    expect(f).toHaveBeenCalledTimes(3);
  });
});


describe('escrow action steps', () => {
  const e = { total: 3_000_000n, settled: 1_000_000n, milestones: [{ index: 0, amount: 1_000_000n }, { index: 1, amount: 2_000_000n }] } as unknown as Escrow;
  it('round-trips action keys and rejects junk', () => {
    for (const a of [{ kind: 'fund' }, { kind: 'dispute' }, { kind: 'approve', index: 1 }, { kind: 'claim', index: 12 }] as const)
      expect(parseActionKey(actionKey(a))).toEqual(a);
    expect(parseActionKey('approve')).toBeNull();
    expect(parseActionKey('drain-1')).toBeNull();
    expect(parseActionKey(undefined)).toBeNull();
  });
  it('describes amounts and danger', () => {
    expect(describeAction({ kind: 'approve', index: 1 }, e)).toMatchObject({ amount: 2_000_000n, danger: false, title: 'Approve milestone 2' });
    expect(describeAction({ kind: 'dispute' }, e)).toMatchObject({ amount: 2_000_000n, danger: true });
    expect(describeAction({ kind: 'fund' }, e).amount).toBe(3_000_000n);
  });
});
