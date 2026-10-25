import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

/**
 * SLIP-0010 ed25519 derivation (hardened-only), as used by Phantom/Solflare/solana-keygen
 * for m/44'/501'/{account}'/0'.
 */
export function slip10Ed25519(seed: Uint8Array, path: string): Uint8Array {
  if (!/^m(\/\d+')+$/.test(path)) throw new Error('ed25519 SLIP-0010 supports hardened paths only');
  let I = hmac(sha512, utf8ToBytes('ed25519 seed'), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const seg of path.split('/').slice(1)) {
    const idx = (Number(seg.slice(0, -1)) + 0x80000000) >>> 0;
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, idx, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export const solanaAddressFromSeedKey = (key32: Uint8Array) => base58.encode(ed25519.getPublicKey(key32));

export function isValidSolanaAddress(a: string): boolean {
  try {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && base58.decode(a).length === 32;
  } catch {
    return false;
  }
}

const DEVNET_RPC = 'https://api.devnet.solana.com';

/** Lamports balance on Solana Devnet via JSON-RPC getBalance. */
export async function solanaDevnetBalance(address: string, rpc = DEVNET_RPC): Promise<bigint> {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
  });
  if (!r.ok) throw new Error(`Solana RPC HTTP ${r.status}`);
  const j = (await r.json()) as { result?: { value: number }; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return BigInt(j.result?.value ?? 0);
}
