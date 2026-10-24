import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { base58 } from '@scure/base';

/** Tron mainnet & testnet (Nile/Shasta) share the 0x41 address prefix. */
const TRON_PREFIX = 0x41;

export function tronAddressFromPrivateKey(privateKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privateKey, false); // 65 bytes, 0x04 prefix
  const hash = keccak_256(pub.slice(1));
  const payload = new Uint8Array(21);
  payload[0] = TRON_PREFIX;
  payload.set(hash.slice(-20), 1);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(payload);
  full.set(checksum, 21);
  return base58.encode(full);
}

export function isValidTronAddress(addr: string): boolean {
  try {
    const raw = base58.decode(addr);
    if (raw.length !== 25 || raw[0] !== TRON_PREFIX) return false;
    const sum = sha256(sha256(raw.slice(0, 21))).slice(0, 4);
    return sum.every((b, i) => b === raw[21 + i]);
  } catch {
    return false;
  }
}
