/**
 * Session keys for SessionKeyValidator (smart-account VAULTLITE_PLAN step 6).
 * - Key generated on device, stored in SecureStore (WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication).
 * - Enabled by an owner-signed op calling SessionKeyValidator.enableSession (or at install via onInstall data).
 * - sessionId = sessionIdOf(account, key, salt), read AFTER install (it includes the per-account epoch).
 * - Session ops: nonce key = SessionKeyValidator << 32, signature = sessionId(32) ‖ EIP-191 sig(65).
 */
import { concat, encodeAbiParameters, encodeFunctionData, getAddress, parseAbi, zeroAddress, type Hex, type PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { smartAccountAbi } from './abis';
import { BASE_SEPOLIA_CONTRACTS as C } from './config';
import { MODULE_TYPE_VALIDATOR, STUB_SIGNATURE } from './encoding';
import type { Call } from './types';
import type { BuildOptions, OpSigner } from './VaultLiteSmartAccountProvider';
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

/** Session/module management ops are never sponsored by the proxy (BUNDLER_PROXY.md §4): send them self-paid. */
export const SESSION_MANAGEMENT_OPTS: BuildOptions = { sponsor: false };

export class InvalidSessionConfigError extends Error {}

/** Addresses SessionKeyValidator._enable rejects as permission targets (account, SKV and known modules). */
export function forbiddenSessionTargets(account: Hex): string[] {
  return [account, C.sessionKeyValidator, C.ecdsaOwnerValidator, C.recoveryExecutor, C.escrowExecutor].map((a) => getAddress(a));
}

/**
 * Client-side mirror of the on-chain checks, so an invalid config never becomes a reverting (gas-burning) op:
 * non-zero session key, validUntil == 0 or > validAfter, and no account/module permission targets.
 */
export function validateSessionConfig(account: Hex, cfg: SessionConfig): void {
  if (!cfg.sessionKey || getAddress(cfg.sessionKey) === zeroAddress) throw new InvalidSessionConfigError('Session key must be a non-zero address.');
  if (cfg.validUntil !== 0 && cfg.validUntil <= cfg.validAfter) throw new InvalidSessionConfigError('validUntil must be 0 (no expiry) or after validAfter.');
  if (!cfg.permissions.length) throw new InvalidSessionConfigError('A session needs at least one permission.');
  const bad = new Set(forbiddenSessionTargets(account));
  for (const p of cfg.permissions) {
    if (bad.has(getAddress(p.target))) throw new InvalidSessionConfigError(`Permission target ${p.target} is the account or a module; SessionKeyValidator rejects it.`);
  }
}

const isModuleTypeAbi = parseAbi(['function isModuleType(uint256 moduleTypeId) view returns (bool)']);

/** Optional on-chain check: any target answering isModuleType(1..4) == true is a module (feat/hardening rejects it). */
export async function assertTargetsNotModules(client: Pick<PublicClient, 'readContract'>, cfg: SessionConfig): Promise<void> {
  for (const p of cfg.permissions) {
    for (const t of [1n, 2n, 3n, 4n]) {
      const yes = await client.readContract({ address: p.target, abi: isModuleTypeAbi, functionName: 'isModuleType', args: [t] }).catch(() => false);
      if (yes) throw new InvalidSessionConfigError(`Permission target ${p.target} is an ERC-7579 module (type ${t}).`);
    }
  }
}

/** Extra verification gas for session ops: ~80k base (uses/nativeSpent SSTOREs) + ~25k per token-capped call. */
export const SESSION_VERIFICATION_GAS_BASE = 80_000n;
export const SESSION_VERIFICATION_GAS_PER_TOKEN_CALL = 25_000n;
export function sessionVerificationGasBuffer(calls: Call[], tokenCaps: { token: Hex }[]): bigint {
  const capped = new Set(tokenCaps.map((t) => getAddress(t.token)));
  const n = calls.filter((c) => capped.has(getAddress(c.to))).length;
  return SESSION_VERIFICATION_GAS_BASE + SESSION_VERIFICATION_GAS_PER_TOKEN_CALL * BigInt(n);
}

/** account.installModule(VALIDATOR, SessionKeyValidator, abi.encode(cfg)) — call to the account itself. Internal: use prepareSessionInstall. */
function encodeInstallSessionModule(account: Hex, cfg: SessionConfig): Call {
  const data = cfg ? encodeAbiParameters([SESSION_CONFIG_TUPLE], [cfg]) : '0x';
  return {
    to: account,
    data: encodeFunctionData({ abi: smartAccountAbi, functionName: 'installModule', args: [MODULE_TYPE_VALIDATOR, C.sessionKeyValidator, data] }),
  };
}

/** SessionKeyValidator.enableSession(cfg). Internal: use prepareSessionInstall. */
function encodeEnableSession(cfg: SessionConfig): Call {
  return { to: C.sessionKeyValidator, data: encodeFunctionData({ abi: sessionKeyValidatorWriteAbi, functionName: 'enableSession', args: [cfg] }) };
}

/**
 * The only way to encode a session install/enable call: sync validation (validateSessionConfig), then the
 * on-chain isModuleType check (assertTargetsNotModules). Returns installModule(SKV, cfg) when the SKV is not yet
 * installed on the account, otherwise SKV.enableSession(cfg). Send with SESSION_MANAGEMENT_OPTS (self-paid).
 */
export async function prepareSessionInstall(
  client: Pick<PublicClient, 'readContract'>,
  account: Hex,
  cfg: SessionConfig,
  opts: { validatorInstalled: boolean },
): Promise<Call> {
  validateSessionConfig(account, cfg);
  await assertTargetsNotModules(client, cfg);
  return opts.validatorInstalled ? encodeEnableSession(cfg) : encodeInstallSessionModule(account, cfg);
}

export const encodeRevokeSession = (sessionId: Hex): Call => ({
  to: C.sessionKeyValidator,
  data: encodeFunctionData({ abi: sessionKeyValidatorWriteAbi, functionName: 'revokeSession', args: [sessionId] }),
});

/**
 * One-shot OpSigner for a session: signature = sessionId ‖ EIP-191(userOpHash) by the session key.
 * The private key is dropped after the first signature; load a fresh signer (SessionKeyStore.signer) per op.
 */
export function sessionSigner(sessionId: Hex, privateKey: Hex, opts: { nonceLane?: number; verificationGasBuffer?: bigint } = {}): OpSigner {
  let pk: Hex | null = privateKey;
  return {
    validator: C.sessionKeyValidator,
    nonceLane: opts.nonceLane ?? 0,
    stubSignature: concat([sessionId, STUB_SIGNATURE]),
    verificationGasBuffer: opts.verificationGasBuffer ?? SESSION_VERIFICATION_GAS_BASE,
    requiresDeployed: true,
    signUserOpHash: async (h) => {
      if (!pk) throw new Error('Session signer already used; load a new one for each op.');
      const key = privateKeyToAccount(pk);
      pk = null;
      return concat([sessionId, await key.signMessage({ message: { raw: h } })]);
    },
  };
}

export interface StoredSessionMeta {
  account: Hex;
  sessionKey: Hex;
  salt: Hex;
  sessionId: Hex | null; // set after sessionIdOf read post-install
  /** Same value as the on-chain SessionConfig.validUntil (0 = no expiry). */
  validUntil: number;
  /** Token-capped targets, for the verification gas buffer. */
  tokenCaps: Hex[];
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
      return Array.isArray(v) ? (v as StoredSessionMeta[]).map((m) => ({ ...m, tokenCaps: m.tokenCaps ?? [] })) : [];
    } catch {
      return [];
    }
  }

  private async save(account: Hex, all: StoredSessionMeta[]) {
    await this.kv.set(META(account), JSON.stringify(all));
  }

  /** Generates and stores a fresh key; returns its metadata. Build the on-chain cfg with configFor(). */
  async create(account: Hex, opts: { salt: Hex; ttlSeconds?: number; validUntil?: number; tokenCaps?: Hex[] }): Promise<StoredSessionMeta> {
    const pk = generatePrivateKey();
    const sessionKey = privateKeyToAccount(pk).address;
    await this.kv.set(PK(account, sessionKey), pk, { requireAuth: true });
    const meta: StoredSessionMeta = {
      account,
      sessionKey,
      salt: opts.salt,
      sessionId: null,
      validUntil: opts.validUntil ?? this.now() + (opts.ttlSeconds ?? DEFAULT_SESSION_TTL_S),
      tokenCaps: opts.tokenCaps ?? [],
      createdAt: this.now(),
    };
    await this.save(account, [...(await this.list(account)), meta]);
    return meta;
  }

  /** On-chain SessionConfig derived from stored metadata, so local expiry == chain expiry. */
  configFor(meta: StoredSessionMeta, policy: Pick<SessionConfig, 'permissions' | 'tokenCaps' | 'maxUses' | 'nativeCap'> & { validAfter?: number }): SessionConfig {
    const caps = new Set(meta.tokenCaps.map((t) => getAddress(t)));
    const missing = policy.tokenCaps.filter((t) => !caps.has(getAddress(t.token)));
    if (missing.length || policy.tokenCaps.length !== meta.tokenCaps.length) throw new InvalidSessionConfigError('tokenCaps differ from the stored session metadata.');
    const cfg: SessionConfig = { sessionKey: meta.sessionKey, validAfter: policy.validAfter ?? 0, validUntil: meta.validUntil, salt: meta.salt, ...policy };
    validateSessionConfig(meta.account, cfg);
    return cfg;
  }

  async setSessionId(account: Hex, sessionKey: Hex, sessionId: Hex) {
    const all = await this.list(account);
    await this.save(account, all.map((m) => (m.sessionKey.toLowerCase() === sessionKey.toLowerCase() ? { ...m, sessionId } : m)));
  }

  /** Loads the key (biometric prompt on device) and returns an OpSigner. Expired/unknown → null (and key deleted). */
  async signer(account: Hex, sessionKey: Hex, calls: Call[], prompt = 'Use session key'): Promise<OpSigner | null> {
    const meta = (await this.list(account)).find((m) => m.sessionKey.toLowerCase() === sessionKey.toLowerCase());
    if (!meta?.sessionId) return null;
    if (meta.validUntil && meta.validUntil <= this.now()) {
      await this.remove(account, sessionKey);
      return null;
    }
    const pk = (await this.kv.get(PK(account, sessionKey), { requireAuth: true, prompt })) as Hex | null;
    return pk ? sessionSigner(meta.sessionId, pk, { verificationGasBuffer: sessionVerificationGasBuffer(calls, meta.tokenCaps.map((token) => ({ token }))) }) : null;
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
