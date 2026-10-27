/** Formats on the UI thread (worklet). */
export function formatFixed(v: number, decimals: number, prefix: string) {
  'worklet';
  const fixed = v.toFixed(decimals);
  const [i, d] = fixed.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return prefix + grouped + (d ? '.' + d : '');
}

