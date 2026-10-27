import { applyKey } from '@/lib/keypad';
import { previewRows } from '@/lib/preview';

describe('keypad applyKey', () => {
  it('builds a PIN up to max length and deletes', () => {
    let v = '';
    for (const k of ['4', '8', '2', '9', '1', '6', '7']) v = applyKey(v, k, { maxLength: 6 });
    expect(v).toBe('482916');
    expect(applyKey(v, 'back')).toBe('48291');
    expect(applyKey('', 'back')).toBe('');
    expect(applyKey('12', '.', { maxLength: 6 })).toBe('12');
  });
  it('handles decimal amounts', () => {
    expect(applyKey('', '.', { decimal: true })).toBe('0.');
    expect(applyKey('1.5', '.', { decimal: true })).toBe('1.5');
    expect(applyKey('0', '7', { decimal: true })).toBe('7');
    expect(applyKey('0.', '0', { decimal: true })).toBe('0.0');
    expect(applyKey('1', 'x', { decimal: true })).toBe('1');
  });
});

describe('home asset preview', () => {
  it('caps at 4, non-zero balances first, otherwise stable', () => {
    const rows = [0n, 5n, null, 0n, 2n, 0n].map((balance, i) => ({ id: i, balance }));
    expect(previewRows(rows).map((r) => r.id)).toEqual([1, 4, 0, 2]);
    expect(previewRows(rows, 10)).toHaveLength(6);
  });
});

describe('recipientRisk', () => {
  const { recipientRisk } = jest.requireActual('@/lib/recipient-risk') as typeof import('@/lib/recipient-risk');
  it('flags sends to the token contract itself and to contracts', () => {
    expect(recipientRisk('0xAbc', '0xabc', '0x')).toBe('token-contract');
    expect(recipientRisk('0x1', null, '0x6080')).toBe('contract');
    expect(recipientRisk('0x1', '0x2', '0x')).toBeNull();
    expect(recipientRisk('0x1', null, undefined)).toBeNull();
  });
});

describe('activity grouping', () => {
  const { groupByDay, matchesFilter } = jest.requireActual('@/lib/activity-groups') as typeof import('@/lib/activity-groups');
  it('groups newest-first rows by day with Today/Yesterday labels', () => {
    const now = new Date(2026, 9, 27, 15, 0).getTime();
    const rows = [now - 1000, now - 3_600_000, now - 86_400_000, new Date(2026, 9, 19, 12).getTime()].map((at) => ({ at }));
    const g = groupByDay(rows, now);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['Today', 2], ['Yesterday', 1], ['Mon, Oct 19', 1]]);
  });
  it('filters by direction and pending', () => {
    const out = { at: 0, direction: 'out' as const, pending: true };
    const inn = { at: 0, direction: 'in' as const, pending: false };
    expect([out, inn].filter((r) => matchesFilter(r, 'sent'))).toEqual([out]);
    expect([out, inn].filter((r) => matchesFilter(r, 'received'))).toEqual([inn]);
    expect([out, inn].filter((r) => matchesFilter(r, 'pending'))).toEqual([out]);
    expect([out, inn].filter((r) => matchesFilter(r, 'all'))).toHaveLength(2);
  });
});
