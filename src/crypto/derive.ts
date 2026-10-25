import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { privateKeyToAccount } from 'viem/accounts';

import { slip10Ed25519, solanaAddressFromSeedKey } from './solana';
import { tronAddressFromPrivateKey } from './tron';

export const PATHS = {
  evm: (i = 0) => `m/44'/60'/0'/0/${i}`,
  tron: (i = 0) => `m/44'/195'/0'/0/${i}`,
  /** Solana uses SLIP-0010 ed25519, hardened-only: m/44'/501'/i'/0' (see crypto/solana.ts). */
  solana: (i = 0) => `m/44'/501'/${i}'/0'`,
} as const;

export type WalletSecret =
  | { kind: 'mnemonic'; mnemonic: string }
  | { kind: 'privateKey'; privateKey: string /* 0x-hex secp256k1 */ };

export interface DerivedAccounts {
  evm: { address: `0x${string}`; path: string | null };
  tron: { address: string; path: string | null };
  solana: { address: string | null; path: string | null; note: string };
}

export const newMnemonic = (strength: 128 | 256 = 128) => generateMnemonic(wordlist, strength);

export const normalizeMnemonic = (m: string) => m.trim().toLowerCase().split(/\s+/).join(' ');

export const isValidMnemonic = (m: string) => validateMnemonic(normalizeMnemonic(m), wordlist);

export function isValidPrivateKey(pk: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(pk.trim()) && !/^(0x)?0{64}$/.test(pk.trim());
}

export function normalizePrivateKey(pk: string): `0x${string}` {
  const h = pk.trim().toLowerCase().replace(/^0x/, '');
  return `0x${h}`;
}

function keyAt(seed: Uint8Array, path: string): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey) throw new Error(`No private key at ${path}`);
  return node.privateKey;
}

export function evmPrivateKeyFromMnemonic(mnemonic: string, index = 0, passphrase = ''): `0x${string}` {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic), passphrase);
  return `0x${bytesToHex(keyAt(seed, PATHS.evm(index)))}`;
}

export function tronPrivateKeyFromMnemonic(mnemonic: string, index = 0, passphrase = ''): `0x${string}` {
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic), passphrase);
  return `0x${bytesToHex(keyAt(seed, PATHS.tron(index)))}`;
}

export function evmAddressFromPrivateKey(pk: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(pk).address;
}

export function deriveAccounts(secret: WalletSecret, index = 0): DerivedAccounts {
  const solana = { address: null as string | null, path: PATHS.solana(index) as string | null, note: 'Not available for private-key imports (Solana uses ed25519).' };
  if (secret.kind === 'mnemonic') {
    const seed = mnemonicToSeedSync(normalizeMnemonic(secret.mnemonic));
    solana.address = solanaAddressFromSeedKey(slip10Ed25519(seed, PATHS.solana(index)));
    solana.note = 'Solana Devnet (SLIP-0010 ed25519). Receive + balance only.';
    const evmKey = keyAt(seed, PATHS.evm(index));
    const tronKey = keyAt(seed, PATHS.tron(index));
    return {
      evm: { address: evmAddressFromPrivateKey(`0x${bytesToHex(evmKey)}`), path: PATHS.evm(index) },
      tron: { address: tronAddressFromPrivateKey(tronKey), path: PATHS.tron(index) },
      solana,
    };
  }
  // Raw private key import: same secp256k1 key controls both EVM and Tron addresses.
  const pk = normalizePrivateKey(secret.privateKey);
  return {
    evm: { address: evmAddressFromPrivateKey(pk), path: null },
    tron: { address: tronAddressFromPrivateKey(hexToBytes(pk.slice(2))), path: null },
    solana: { ...solana, path: null },
  };
}

/** Signing keys for the current secret. Call only right before signing; never store the result. */
export function signingKeys(secret: WalletSecret, index = 0): { evm: `0x${string}`; tron: `0x${string}` } {
  if (secret.kind === 'mnemonic') {
    return { evm: evmPrivateKeyFromMnemonic(secret.mnemonic, index), tron: tronPrivateKeyFromMnemonic(secret.mnemonic, index) };
  }
  const pk = normalizePrivateKey(secret.privateKey);
  return { evm: pk, tron: pk };
}
