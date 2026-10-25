import type { ScanResult } from './scan';

/** One-shot hand-off from the /scan screen back to the screen that opened it. */
let last: ScanResult | null = null;
export const putScan = (r: ScanResult) => void (last = r);
export function takeScan(): ScanResult | null {
  const r = last;
  last = null;
  return r;
}
