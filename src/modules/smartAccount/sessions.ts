/**
 * Session keys for SessionKeyValidator (smart-account VAULTLITE_PLAN step 6).
 * - Key generated on device, stored in SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication).
 * - Enabled by an owner-signed op calling SessionKeyValidator.enableSession (or at install via onInstall data).
 * - sessionId = sessionIdOf(account, key, salt), read AFTER install (it includes the per-account epoch).
 * - Session ops: nonce key = SessionKeyValidator << 32, signature = sessionId(32) ‖ EIP-191 sig(65).
 */
import { concat, encodeAbiParameters, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { smartAccountAbi } from './abis';
import { BASE_SEPOLIA_CONTRACTS as C } from './config';
import { MODULE_TYPE_VALIDATOR, STUB_SIGNATURE } from './encoding';
import type { Call } from './types';
import type { OpSigner } from './VaultLiteSmartAccountProvider';
import type { SecureKV } from '@/vault/storage';

export interface SessionConfig {
  sessionKey: Hex;
  validAfter: number; // unix seconds (uint48)
  validUntil: number; // unix seconds, 0 = no expiry
  maxUses: number; // 0 = unlimited
  nativeCap: bigint; // cumulative wei
  salt: Hex;
  permissions: { target: Hex; selector: Hex }[];
  tokenCaps: { token: Hex; cap: bigint }[];
}

export const sessionKeyValidatorWriteAbi = parseAbi([
  'struct Permission { address target; bytes4 selector; }',
  'struct TokenCap { address token; uint128 cap; }',
  'struct SessionConfig { address sessionKey; uint48 validAfter; uint48 validUntil; uint32 maxUses; uint128 nativeCap; bytes32 salt; Permission[] permissions; TokenCap[] tokenCaps; }',
  'function enableSession(SessionConfig cfg) returns (bytes32 sessionId)',
  'function revokeSession(bytes32 sessionId)',
]);

const SESSION_CONFIG_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'sessionKey', type: 'address' },
    { name: 'validAfter', type: 'uint48' },
    { name: 'validUntil', type: 'uint48' },
    { name: 'maxUses', type: 'uint32' },
    { name: 'nativeCap', type: 'uint128' },
    { name: 'salt', type: 'bytes32' },
    { name: 'permissions', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }] },
    { name: 'tokenCaps', type: 'tuple[]', components: [{ name: 'token', type: 'address' }, { name: 'cap', type: 'uint128' }] },
  ],
} as const;

/** Default policy: short expiry. Callers must still pass explicit permissions. */
export const DEFAULT_SESSION_TTL_S = 24 * 3600;

/** account.installModule(VALIDATOR, SessionKeyValidator, cfg ? abi.encode(cfg) : 0x) — call to the account itself. */
export function encodeInstallSessionModule(account: Hex, cfg?: SessionConfig): Call {
  const data = cfg ? encodeAbiParameters([SESSION_CONFIG_TUPLE], [cfg]) : '0x';
  return {
    to: account,
    data: encodeFunctionData({ abi: smartAccountAbi, functionName: 'installModule', args: [MODULE_TYPE_VALIDATOR, C.sessionKeyValidator, data] }),
  };
}

export const encodeEnableSession = (cfg: SessionConfig): Call => ({
  to: C.sessionKeyValidator,
  data: encodeFunctionData({ abi: sessionKeyValidatorWriteAbi, functionName: 'enableSession', args: [cfg] }),
});

export const encodeRevokeSession = (sessionId: Hex): Call => ({
  to: C.sessionKeyValidator,
  data: encodeFunctionData({ abi: sessionKeyValidatorWriteAbi, functionName: 'revokeSession', args: [sessionId] }),
});

/** OpSigner for a session: signature = sessionId ‖ EIP-191(userOpHash) by the session key. */
export function sessionSigner(sessionId: Hex, privateKey: Hex, nonceLane = 0): OpSigner {
  const key = privateKeyToAccount(privateKey);
  return {
    validator: C.sessionKeyValidator,
    nonceLane,
    stubSignature: concat([sessionId, STUB_SIGNATURE]),
    signUserOpHash: async (h) => concat([sessionId, await key.signMessage({ message: { raw: h } })]),
  };
}

export interface StoredSessionMeta {
  account: Hex;
  sessionKey: Hex;
  salt: Hex;
  sessionId: Hex | null; // set after sessionIdOf read post-install
  validUntil: number;
  createdAt: number;
}

const PK = (account: Hex, sessionKey: Hex) => `vaultlite.session.${account.toLowerCase()}.${sessionKey.toLowerCase()}.pk`;
const META = (account: Hex) => `vaultlite.session.${account.toLowerCase()}.meta`;

/** Session key storage. Private keys: requireAuth (biometric) on device; metadata: plain secure item. */
export class SessionKeyStore {
  constructor(private readonly kv: SecureKV, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

  async list(account: Hex): Promise<StoredSessionMeta[]> {
    const raw = await this.kv.get(META(account));
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as StoredSessionMeta[]) : [];
    } catch {
      return [];
    }
  }

  private async save(account: Hex, all: StoredSessionMeta[]) {
    await this.kv.set(META(account), JSON.stringify(all));
  }

  /** Generates a fresh key, stores it, returns its address (the private key never leaves the store). */
  async create(account: Hex, opts: { salt: Hex; ttlSeconds?: number }): Promise<StoredSessionMeta> {
    const pk = generatePrivateKey();
    const sessionKey = privateKeyToAccount(pk).address;
    await this.kv.set(PK(account, sessionKey), pk, { requireAuth: true });
    const meta: StoredSessionMeta = {
      account,
      sessionKey,
      salt: opts.salt,
      sessionId: null,
      validUntil: this.now() + (opts.ttlSeconds ?? DEFAULT_SESSION_TTL_S),
      createdAt: this.now(),
    };
    await this.save(account, [...(await this.list(account)), meta]);
    return meta;
  }

  async setSessionId(account: Hex, sessionKey: Hex, sessionId: Hex) {
    const all = await this.list(account);
    await this.save(account, all.map((m) => (m.sessionKey.toLowerCase() === sessionKey.toLowerCase() ? { ...m, sessionId } : m)));
  }

  /** Loads the key (biometric prompt on device) and returns an OpSigner. Expired/unknown → null (and key deleted). */
  async signer(account: Hex, sessionKey: Hex, prompt = 'Use session key'): Promise<OpSigner | null> {
    const meta = (await this.list(account)).find((m) => m.sessionKey.toLowerCase() === sessionKey.toLowerCase());
    if (!meta?.sessionId) return null;
    if (meta.validUntil && meta.validUntil <= this.now()) {
      await this.remove(account, sessionKey);
      return null;
    }
    const pk = (await this.kv.get(PK(account, sessionKey), { requireAuth: true, prompt })) as Hex | null;
    return pk ? sessionSigner(meta.sessionId, pk) : null;
  }

  /** Delete key + metadata (call after an on-chain revokeSession op, or on expiry). */
  async remove(account: Hex, sessionKey: Hex) {
    await this.kv.remove(PK(account, sessionKey));
    await this.save(account, (await this.list(account)).filter((m) => m.sessionKey.toLowerCase() !== sessionKey.toLowerCase()));
  }

  async pruneExpired(account: Hex): Promise<number> {
    const expired = (await this.list(account)).filter((m) => m.validUntil && m.validUntil <= this.now());
    for (const m of expired) await this.remove(account, m.sessionKey);
    return expired.length;
  }
}
