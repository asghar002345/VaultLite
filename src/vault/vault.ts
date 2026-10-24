/**
 * Vault design
 * ------------
 *  - A PIN-derived key-encryption key (KEK = scrypt(PIN, kdfSalt)) encrypts the wallet secret
 *    with XChaCha20-Poly1305. Ciphertext lives in SecureStore (Keychain / Android Keystore-backed).
 *  - The PIN itself is never stored. A separate salted verifier hash (scrypt(PIN, verifierSalt))
 *    lets us reject wrong PINs and count attempts before touching the ciphertext.
 *  - If biometrics are enabled, the KEK is additionally stored in SecureStore with
 *    `requireAuthentication: true`, so the OS biometric prompt gates its release.
 *  - Decrypted secrets are only returned to the in-memory session (see session.tsx) and are
 *    dropped on lock / app background.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import type { WalletSecret } from '@/crypto/derive';
import { randomBytes } from '@/crypto/random';

import type { SecureKV } from './storage';

export const KEYS = {
  blob: 'vaultlite.vault.v1',
  bioKek: 'vaultlite.biokek.v1',
} as const;

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}
export const DEFAULT_KDF: KdfParams = { N: 2 ** 14, r: 8, p: 1 };

interface VaultBlob {
  v: 1;
  kdf: KdfParams;
  kdfSalt: string;
  verifierSalt: string;
  verifier: string;
  nonce: string;
  ciphertext: string;
  biometrics: boolean;
  failedAttempts: number;
}

const kdf = (pin: string, salt: Uint8Array, p: KdfParams) =>
  scrypt(utf8ToBytes(pin), salt, { N: p.N, r: p.r, p: p.p, dkLen: 32 });

const constantTimeEq = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

export const MAX_PIN_ATTEMPTS = 10;
export const isValidPin = (pin: string) => /^\d{6}$/.test(pin);

export class WrongPinError extends Error {
  constructor(public attemptsLeft: number) {
    super(`Incorrect PIN (${attemptsLeft} attempts left)`);
  }
}

export class Vault {
  constructor(
    private kv: SecureKV,
    private kdfParams: KdfParams = DEFAULT_KDF,
  ) {}

  async exists() {
    return (await this.kv.get(KEYS.blob)) !== null;
  }

  private async load(): Promise<VaultBlob> {
    const raw = await this.kv.get(KEYS.blob);
    if (!raw) throw new Error('Vault not initialised');
    return JSON.parse(raw) as VaultBlob;
  }

  async create(secret: WalletSecret, pin: string, opts: { biometrics?: boolean } = {}) {
    if (!isValidPin(pin)) throw new Error('PIN must be 6 digits');
    const kdfSalt = randomBytes(16);
    const verifierSalt = randomBytes(16);
    const kek = kdf(pin, kdfSalt, this.kdfParams);
    const nonce = randomBytes(24);
    const ct = xchacha20poly1305(kek, nonce).encrypt(utf8ToBytes(JSON.stringify(secret)));
    const blob: VaultBlob = {
      v: 1,
      kdf: this.kdfParams,
      kdfSalt: bytesToHex(kdfSalt),
      verifierSalt: bytesToHex(verifierSalt),
      verifier: bytesToHex(kdf(pin, verifierSalt, this.kdfParams)),
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ct),
      biometrics: !!opts.biometrics,
      failedAttempts: 0,
    };
    await this.kv.set(KEYS.blob, JSON.stringify(blob));
    if (opts.biometrics) await this.kv.set(KEYS.bioKek, bytesToHex(kek), { requireAuth: true });
    else await this.kv.remove(KEYS.bioKek);
    kek.fill(0);
  }

  private decrypt(blob: VaultBlob, kek: Uint8Array): WalletSecret {
    const pt = xchacha20poly1305(kek, hexToBytes(blob.nonce)).decrypt(hexToBytes(blob.ciphertext));
    return JSON.parse(new TextDecoder().decode(pt)) as WalletSecret;
  }

  async unlockWithPin(pin: string): Promise<WalletSecret> {
    const blob = await this.load();
    if (blob.failedAttempts >= MAX_PIN_ATTEMPTS) throw new Error('Too many attempts. Wallet locked; restore from seed.');
    const candidate = kdf(pin, hexToBytes(blob.verifierSalt), blob.kdf);
    if (!constantTimeEq(candidate, hexToBytes(blob.verifier))) {
      blob.failedAttempts += 1;
      await this.kv.set(KEYS.blob, JSON.stringify(blob));
      throw new WrongPinError(MAX_PIN_ATTEMPTS - blob.failedAttempts);
    }
    if (blob.failedAttempts) {
      blob.failedAttempts = 0;
      await this.kv.set(KEYS.blob, JSON.stringify(blob));
    }
    const kek = kdf(pin, hexToBytes(blob.kdfSalt), blob.kdf);
    try {
      return this.decrypt(blob, kek);
    } finally {
      kek.fill(0);
    }
  }

  async biometricsEnabled() {
    try {
      return (await this.load()).biometrics;
    } catch {
      return false;
    }
  }

  /** Caller should have confirmed hardware availability; SecureStore triggers the OS prompt. */
  async unlockWithBiometrics(prompt = 'Unlock VaultLite'): Promise<WalletSecret> {
    const blob = await this.load();
    if (!blob.biometrics) throw new Error('Biometrics not enabled');
    const hex = await this.kv.get(KEYS.bioKek, { requireAuth: true, prompt });
    if (!hex) throw new Error('Biometric key unavailable');
    const kek = hexToBytes(hex);
    try {
      return this.decrypt(blob, kek);
    } finally {
      kek.fill(0);
    }
  }

  async wipe() {
    await this.kv.remove(KEYS.blob);
    await this.kv.remove(KEYS.bioKek);
  }
}
