import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

import { isValidTronAddress } from './tron';

export function tronHexToBase58(hex: string): string {
  const h = hex.replace(/^0x/, '');
  const payload = hexToBytes(h.length === 40 ? `41${h}` : h);
  const sum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(payload);
  full.set(sum, 21);
  return base58.encode(full);
}

/** Accept either base58 (visible=true) or 41-prefixed hex (visible=false). */
export const normalizeTronAddress = (a: string) => (isValidTronAddress(a) ? a : /^(0x)?41[0-9a-fA-F]{40}$/.test(a) ? tronHexToBase58(a) : a);

const sig65 = (digest: Uint8Array, pk: `0x${string}`) => {
  const s = secp256k1.sign(digest, hexToBytes(pk.slice(2)), { prehash: false, format: 'recovered' });
  return bytesToHex(s.slice(1)) + (s[0] + 27).toString(16);
};

/** TronWeb `signMessageV2` scheme: keccak256("\x19TRON Signed Message:\n" + len + msg). */
export function tronMessageDigest(message: string | Uint8Array): Uint8Array {
  const bytes = typeof message === 'string' ? utf8ToBytes(message) : message;
  const prefix = utf8ToBytes(`\x19TRON Signed Message:\n${bytes.length}`);
  const buf = new Uint8Array(prefix.length + bytes.length);
  buf.set(prefix);
  buf.set(bytes, prefix.length);
  return keccak_256(buf);
}

export const signTronMessage = (message: string, pk: `0x${string}`) => `0x${sig65(tronMessageDigest(message), pk)}`;

export interface TronTxLike {
  txID: string;
  raw_data: { contract?: { type: string; parameter: { value: Record<string, unknown> } }[]; expiration?: number; fee_limit?: number };
  raw_data_hex: string;
  signature?: string[];
  visible?: boolean;
}

/** txID must equal sha256(raw_data_hex) — otherwise the dApp could show one tx and have us sign another. */
export const tronTxIdMatches = (tx: TronTxLike) => bytesToHex(sha256(hexToBytes(tx.raw_data_hex))) === tx.txID.toLowerCase();

export function signTronTxObject<T extends TronTxLike>(tx: T, pk: `0x${string}`): T {
  if (!tronTxIdMatches(tx)) throw new Error('txID does not match raw_data_hex');
  return { ...tx, signature: [...(tx.signature ?? []), sig65(hexToBytes(tx.txID), pk)] };
}

export interface TronTxSummary {
  type: string;
  owner?: string;
  to?: string;
  amountSun?: string;
  contract?: string;
  data?: `0x${string}`;
  callValueSun?: string;
  feeLimitSun?: number;
  expiration?: number;
}

export function summarizeTronTx(tx: TronTxLike): TronTxSummary {
  const c = tx.raw_data.contract?.[0];
  if (!c) return { type: 'Unknown' };
  const v = c.parameter.value as Record<string, string | number | undefined>;
  const addr = (x: unknown) => (typeof x === 'string' ? normalizeTronAddress(x) : undefined);
  return {
    type: c.type,
    owner: addr(v.owner_address),
    to: addr(v.to_address),
    amountSun: v.amount !== undefined ? String(v.amount) : undefined,
    contract: addr(v.contract_address),
    data: typeof v.data === 'string' ? (`0x${v.data}` as const) : undefined,
    callValueSun: v.call_value !== undefined ? String(v.call_value) : undefined,
    feeLimitSun: tx.raw_data.fee_limit,
    expiration: tx.raw_data.expiration,
  };
}
