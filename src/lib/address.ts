import { getAddress, isAddress } from 'viem';

import type { ChainFamily } from '@/config/chains';
import { isValidTronAddress } from '@/crypto/tron';

export type AddressCheck = { ok: true; normalized: string } | { ok: false; reason: string };

/**
 * EVM: all-lowercase / all-uppercase hex is accepted (no checksum encoded) and normalized to
 * EIP-55; mixed-case input must carry a valid EIP-55 checksum.
 * Tron: base58check, 0x41 prefix, 25 bytes.
 */
export function validateAddress(family: ChainFamily, input: string): AddressCheck {
  const a = input.trim();
  if (family === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { ok: false, reason: 'Not a 0x-prefixed 20-byte hex address' };
    const body = a.slice(2);
    const singleCase = body === body.toLowerCase() || body === body.toUpperCase();
    if (!singleCase && !isAddress(a, { strict: true })) return { ok: false, reason: 'Checksum mismatch (EIP-55)' };
    if (/^0x0{40}$/.test(a)) return { ok: false, reason: 'Zero address' };
    return { ok: true, normalized: getAddress(a) };
  }
  if (family === 'tron') {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return { ok: false, reason: 'Not a Tron base58 address (T…)' };
    if (!isValidTronAddress(a)) return { ok: false, reason: 'Invalid Tron checksum' };
    return { ok: true, normalized: a };
  }
  return { ok: false, reason: 'Unsupported chain' };
}
