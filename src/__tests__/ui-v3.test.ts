import { applyKey } from '@/components/keypad';
import { previewRows } from '@/components/token-row';

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
