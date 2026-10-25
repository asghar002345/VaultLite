import { NATIVE, type TokenInfo } from '@/config/tokens';

export type SpamVerdict = { level: 'ok' | 'unverified' | 'spam'; reasons: string[] };

const URLISH = /(https?:|www\.|\.(com|io|xyz|net|org|app|site|top|live|claim|gift)\b|t\.me\/)/i;
const BAIT = /\b(claim|reward|airdrop|visit|bonus|voucher|free|giveaway|redeem)\b/i;

/**
 * Classify an incoming transfer:
 *  - spam: zero-value transfers (address poisoning), URL/bait symbols, impersonation of a
 *    curated symbol from a different contract, or a sender that mimics our own address.
 *  - unverified: token not in the curated/custom list.
 *  - ok: native coin or a known token.
 */
export function classifyIncoming(
  tx: { chain: string; tokenAddress: string; symbol: string; amount: string; from: string; to: string },
  known: TokenInfo[],
): SpamVerdict {
  const reasons: string[] = [];
  const isNative = tx.tokenAddress === NATIVE;
  const knownToken = isNative || known.some((t) => t.chain === tx.chain && t.address.toLowerCase() === tx.tokenAddress.toLowerCase());
  if (BigInt(tx.amount || '0') === 0n) reasons.push('zero-value transfer (address-poisoning pattern)');
  if (!knownToken) {
    if (URLISH.test(tx.symbol)) reasons.push('link in token symbol');
    if (BAIT.test(tx.symbol)) reasons.push('bait wording in token symbol');
    if (/[^\x00-\x7F]/.test(tx.symbol)) reasons.push('non-ASCII look-alike symbol');
    const sym = tx.symbol.trim().toUpperCase();
    if (known.some((t) => t.chain === tx.chain && t.symbol.toUpperCase() === sym)) reasons.push(`impersonates ${sym} (different contract)`);
  }
  if (looksLikePoisoning(tx.from, tx.to)) reasons.push('sender mimics your address');
  if (reasons.length) return { level: 'spam', reasons };
  return knownToken ? { level: 'ok', reasons } : { level: 'unverified', reasons: ['token not in your list'] };
}

/** Same first 4 and last 4 characters (after any 0x/T prefix) but a different address. */
export function looksLikePoisoning(from: string, me: string): boolean {
  const norm = (a: string) => a.replace(/^0x/i, '').toLowerCase();
  const a = norm(from);
  const b = norm(me);
  return a !== b && a.length > 10 && a.slice(0, 4) === b.slice(0, 4) && a.slice(-4) === b.slice(-4);
}
