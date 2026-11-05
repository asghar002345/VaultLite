/** Pure: apply one keypad key to a value (digits, '.', 'back'), respecting a max length and one decimal point. */
export function applyKey(value: string, key: string, opts: { maxLength?: number; decimal?: boolean } = {}): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === '.') {
    if (!opts.decimal || value.includes('.')) return value;
    return value === '' ? '0.' : value + '.';
  }
  if (!/^\d$/.test(key)) return value;
  if (opts.maxLength !== undefined && value.length >= opts.maxLength) return value;
  if (opts.decimal && value === '0') return key;
  return value + key;
}
