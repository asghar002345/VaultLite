/** Regression tests for Blockchain Dev review /workspace/reviews/vaultlite-userop-review.md (B1–B2, S1–S6, N1–N5). */
import { recoverMessageAddress, type Hex, type PublicClient } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { BundlerClient, BundlerRpcError, EntryPointNotSupportedError } from '@/modules/smartAccount/client';
import { BASE_SEPOLIA_CONTRACTS as C, ENTRY_POINT_V07, SMART_ACCOUNT_CONFIG } from '@/modules/smartAccount/config';
import { DEFAULT_SALT, nonceKeyFor, predictAccountAddress } from '@/modules/smartAccount/encoding';
import { describeAAError } from '@/modules/smartAccount/errors';
import { createMockBundler, MOCK_PAYMASTER } from '@/modules/smartAccount/mock-bundler';
import {
  assertTargetsNotModules,
  InvalidSessionConfigError,
  prepareSessionInstall,
  SESSION_MANAGEMENT_OPTS,
  SESSION_VERIFICATION_GAS_BASE,
  SESSION_VERIFICATION_GAS_PER_TOKEN_CALL,
  SessionKeyStore,
  sessionSigner,
  sessionVerificationGasBuffer,
  type SessionConfig,
} from '@/modules/smartAccount/sessions';
import { UserOpHashMismatchError, VaultLiteSmartAccountProvider } from '@/modules/smartAccount/VaultLiteSmartAccountProvider';
import { MemoryKV } from '@/vault/storage';

const owner = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 0 });
const ACCOUNT: Hex = '0x9fC283814D91Aa88fcA0C6c60d1e868b582ca0dd';
const ESCROW: Hex = '0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528';
const USDC: Hex = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const URL = 'https://proxy.test/api/bundler/84532';
const SID: Hex = `0x${'5e'.repeat(32)}`;
const PK: Hex = `0x${'42'.repeat(32)}`;

function fakeChain({ deployed = false } = {}) {
  return {
    chain: baseSepolia,
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      if (functionName === 'getAddress') return predictAccountAddress(args[0] as Hex, args[1] as Hex);
      if (functionName === 'getNonce') return (args[1] as bigint) << 64n;
      throw new Error(functionName);
    },
    getCode: async () => (deployed ? '0x6080' : undefined),
  } as unknown as PublicClient;
}
const mk = (mockOpts: Parameters<typeof createMockBundler>[0] = {}, deployed = false) => {
  const mock = createMockBundler(mockOpts);
  const bundler = new BundlerClient(URL, 84532, ENTRY_POINT_V07, mock.fetcher);
  const p = new VaultLiteSmartAccountProvider({ ...SMART_ACCOUNT_CONFIG.baseSepolia!, bundlerUrl: URL }, fakeChain({ deployed }), owner, { bundler });
  return { p, mock, bundler };
};
const NO_MODULES = { readContract: async () => false } as never;
const call = [{ to: ESCROW, data: '0x12345678' as Hex }];
const cfg = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  sessionKey: '0x1111111111111111111111111111111111111111',
  validAfter: 0,
  validUntil: 2_000_000_000,
  maxUses: 5,
  nativeCap: 0n,
  salt: DEFAULT_SALT,
  permissions: [{ target: ESCROW, selector: '0x12345678' }],
  tokenCaps: [],
  ...over,
});

describe('B1: pm_getPaymasterData without gas fields keeps the paymaster gas limits', () => {
  it('estimate values survive the final merge and are signed', async () => {
    const { p } = mk({ pmDataNoGas: true });
    const op = await p.buildUserOperation(call);
    expect(op.paymaster).toBe(MOCK_PAYMASTER);
    expect(op.paymasterData).toBe('0x' + 'ab'.repeat(32));
    expect(op.paymasterVerificationGasLimit).toBe(0xafc8n);
    expect(op.paymasterPostOpGasLimit).toBe(1n);
    expect(await recoverMessageAddress({ message: { raw: p.userOpHash(op) }, signature: op.signature })).toBe(owner.address);
  });
  it('pm() omits absent keys instead of returning undefined', async () => {
    const { bundler } = mk({ pmDataNoGas: true });
    const r = await bundler.paymasterData({} as never);
    expect(Object.keys(r).sort()).toEqual(['paymaster', 'paymasterData']);
  });
});

describe('B2: session ops get a verification gas buffer before pm_getPaymasterData', () => {
  it('buffer = 80k + 25k per token-capped call', () => {
    expect(sessionVerificationGasBuffer([{ to: ESCROW }], [])).toBe(80_000n);
    expect(sessionVerificationGasBuffer([{ to: USDC }, { to: ESCROW }, { to: USDC }], [{ token: USDC }])).toBe(SESSION_VERIFICATION_GAS_BASE + 2n * SESSION_VERIFICATION_GAS_PER_TOKEN_CALL);
  });
  it('verificationGasLimit = estimate + buffer, and pm_getPaymasterData sees the buffered value', async () => {
    const { p, mock } = mk({}, true);
    const buf = sessionVerificationGasBuffer([{ to: USDC }], [{ token: USDC }]);
    const op = await p.buildUserOperation([{ to: USDC, data: '0x095ea7b3' }], sessionSigner(SID, PK, { verificationGasBuffer: buf }));
    expect(op.verificationGasLimit).toBe(0x186a0n + buf);
    const pmCall = mock.calls.find((c) => c.method === 'pm_getPaymasterData')!;
    expect(BigInt((pmCall.params[0] as { verificationGasLimit: Hex }).verificationGasLimit)).toBe(0x186a0n + buf);
  });
});

describe('S1: session/module management is sent self-paid', () => {
  it('SESSION_MANAGEMENT_OPTS: no pm_* calls, no paymaster', async () => {
    const { p, mock } = mk();
    const inst = await prepareSessionInstall(NO_MODULES, ACCOUNT, cfg(), { validatorInstalled: false });
    const op = await p.buildUserOperation([inst], undefined, SESSION_MANAGEMENT_OPTS);
    expect(mock.methods().some((m) => m.startsWith('pm_'))).toBe(false);
    expect(op.paymaster).toBeUndefined();
  });
  it('not_sponsorable throws a typed error by default, falls back to self-paid when asked', async () => {
    const e = await mk({ notSponsorable: true }).p.buildUserOperation(call).catch((x) => x);
    expect(e).toBeInstanceOf(BundlerRpcError);
    expect(e.notSponsorable).toBe(true);
    const op = await mk({ notSponsorable: true }).p.buildUserOperation(call, undefined, { onNotSponsorable: 'self-pay' });
    expect(op.paymaster).toBeUndefined();
  });
});

describe('S2: isFinal stub keeps its own paymaster gas limits', () => {
  it('estimate pm gas (0xafc8) does not override stub pm gas (0x9c40)', async () => {
    const { p, mock } = mk({ stubIsFinal: true });
    const op = await p.buildUserOperation(call);
    expect(op.paymasterVerificationGasLimit).toBe(0x9c40n);
    expect(op.paymasterData).toBe('0x' + '00'.repeat(32));
    expect(mock.methods()).not.toContain('pm_getPaymasterData');
  });
});

describe('S3: hash mismatch is a hard error with the locally computed hash', () => {
  it('throws UserOpHashMismatchError carrying expected (local) and returned', async () => {
    const bogus: Hex = `0x${'99'.repeat(32)}`;
    const { p, mock } = mk({ tamperHash: bogus });
    const e = await p.sendUserOperation(call).catch((x) => x);
    expect(e).toBeInstanceOf(UserOpHashMismatchError);
    expect(e.returned).toBe(bogus);
    expect(e.expected).toBe(p.userOpHash(mock.sent[0]));
  });
});

describe('S4: session config validated client-side', () => {
  it.each([
    ['account', { permissions: [{ target: ACCOUNT, selector: '0x12345678' as Hex }] }],
    ['SKV', { permissions: [{ target: C.sessionKeyValidator, selector: '0x12345678' as Hex }] }],
    ['ECDSA validator', { permissions: [{ target: C.ecdsaOwnerValidator, selector: '0x12345678' as Hex }] }],
    ['EscrowExecutor', { permissions: [{ target: C.escrowExecutor, selector: '0x12345678' as Hex }] }],
    ['RecoveryExecutor', { permissions: [{ target: C.recoveryExecutor, selector: '0x12345678' as Hex }] }],
    ['validUntil <= validAfter', { validAfter: 100, validUntil: 100 }],
    ['zero key', { sessionKey: '0x0000000000000000000000000000000000000000' as Hex }],
  ])('rejects %s (before any on-chain read)', async (_n, over) => {
    const readContract = jest.fn(async () => false);
    for (const validatorInstalled of [false, true]) {
      await expect(prepareSessionInstall({ readContract } as never, ACCOUNT, cfg(over), { validatorInstalled })).rejects.toBeInstanceOf(InvalidSessionConfigError);
    }
    expect(readContract).not.toHaveBeenCalled();
  });
  it('accepts MilestoneEscrow target and validUntil 0', async () => {
    await expect(prepareSessionInstall(NO_MODULES, ACCOUNT, cfg({ validUntil: 0, validAfter: 50 }), { validatorInstalled: true })).resolves.toMatchObject({ to: C.sessionKeyValidator });
  });
  it('prepareSessionInstall runs the on-chain module check and picks install vs enable', async () => {
    const readContract = jest.fn(async ({ address, args }: { address: Hex; args: [bigint] }) => address === ESCROW && args[0] === 2n);
    await expect(prepareSessionInstall({ readContract } as never, ACCOUNT, cfg(), { validatorInstalled: true })).rejects.toThrow(/module \(type 2\)/);
    expect(readContract).toHaveBeenCalled();
    expect((await prepareSessionInstall(NO_MODULES, ACCOUNT, cfg(), { validatorInstalled: false })).to).toBe(ACCOUNT);
  });
  it('assertTargetsNotModules uses isModuleType(1..4)', async () => {
    const client = { readContract: async ({ address, args }: { address: Hex; args: [bigint] }) => address === ESCROW && args[0] === 2n } as never;
    await expect(assertTargetsNotModules(client, cfg())).rejects.toThrow(/module \(type 2\)/);
    const none = { readContract: async () => { throw new Error('no fn'); } } as never;
    await expect(assertTargetsNotModules(none, cfg())).resolves.toBeUndefined();
  });
});

describe('self-pay is forced for calls to the account or SKV', () => {
  it.each([
    ['account', (a: Hex) => a],
    ['SKV', () => C.sessionKeyValidator as Hex],
  ])('%s target: no pm_* calls even with default sponsorship', async (_n, to) => {
    const { p, mock } = mk();
    const self = await p.getAddress();
    const op = await p.buildUserOperation([...call, { to: to(self), data: '0xdeadbeef' }]);
    expect(op.paymaster).toBeUndefined();
    expect(mock.methods().some((m) => m.startsWith('pm_'))).toBe(false);
  });
  it('explicit sponsor context cannot override it', async () => {
    const { p, mock } = mk();
    await p.buildUserOperation([{ to: C.sessionKeyValidator, data: '0x' }], undefined, { sponsor: { context: { x: 1 } } });
    expect(mock.methods().some((m) => m.startsWith('pm_'))).toBe(false);
  });
});

describe('S5: proxy EntryPoint check + method allowlist', () => {
  it('missing v0.7 in eth_supportedEntryPoints aborts before any userOp call', async () => {
    const { p, mock } = mk({ supportedEntryPoints: ['0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'] });
    await expect(p.buildUserOperation(call)).rejects.toBeInstanceOf(EntryPointNotSupportedError);
    expect(mock.methods()).toEqual(['eth_supportedEntryPoints']);
  });
  it('check is cached across ops', async () => {
    const { p, mock } = mk();
    await p.buildUserOperation(call);
    await p.buildUserOperation(call);
    expect(mock.methods().filter((m) => m === 'eth_supportedEntryPoints')).toHaveLength(1);
  });
  it('mock rejects pm_sponsorUserOperation like the (tightened) proxy', async () => {
    const { mock } = mk();
    const res = await mock.fetcher(URL, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pm_sponsorUserOperation', params: [] }) });
    expect((await res.json()).error.message).toBe('method_not_allowed');
  });
});

describe('S6: store expiry == on-chain validUntil', () => {
  it('create(validUntil) is stored and configFor uses it', async () => {
    const store = new SessionKeyStore(new MemoryKV(), () => 1000);
    const meta = await store.create(ACCOUNT, { salt: DEFAULT_SALT, validUntil: 5000, tokenCaps: [USDC] });
    expect(meta.validUntil).toBe(5000);
    const c = store.configFor(meta, { permissions: [{ target: ESCROW, selector: '0x12345678' }], tokenCaps: [{ token: USDC, cap: 10n }], maxUses: 3, nativeCap: 0n });
    expect(c.validUntil).toBe(5000);
    expect(c.sessionKey).toBe(meta.sessionKey);
    expect(() => store.configFor(meta, { permissions: [{ target: ESCROW, selector: '0x12345678' }], tokenCaps: [], maxUses: 3, nativeCap: 0n })).toThrow(InvalidSessionConfigError);
  });
});

describe('SessionKeyStore.signer requires calls', () => {
  it('gas buffer is derived from the calls passed', async () => {
    const store = new SessionKeyStore(new MemoryKV(), () => 1000);
    const meta = await store.create(ACCOUNT, { salt: DEFAULT_SALT, validUntil: 5000, tokenCaps: [USDC] });
    await store.setSessionId(ACCOUNT, meta.sessionKey, SID);
    const s = await store.signer(ACCOUNT, meta.sessionKey, [{ to: USDC }, { to: ESCROW }]);
    expect(s?.verificationGasBuffer).toBe(SESSION_VERIFICATION_GAS_BASE + SESSION_VERIFICATION_GAS_PER_TOKEN_CALL);
  });
});

describe('nits', () => {
  it('N1: nonce lane range is enforced', () => {
    expect(() => nonceKeyFor(C.ecdsaOwnerValidator, 2 ** 32)).toThrow(RangeError);
    expect(() => nonceKeyFor(C.ecdsaOwnerValidator, -1)).toThrow(RangeError);
    expect(nonceKeyFor(C.ecdsaOwnerValidator, 0xffffffff) & 0xffffffffn).toBe(0xffffffffn);
  });
  it('N2: session signer is one-shot', async () => {
    const s = sessionSigner(SID, PK);
    await s.signUserOpHash(`0x${'01'.repeat(32)}`);
    await expect(s.signUserOpHash(`0x${'01'.repeat(32)}`)).rejects.toThrow(/already used/);
  });
  it('N3: AA copy per v0.7', () => {
    expect(describeAAError('AA25 invalid account nonce')).toBe('Invalid account nonce.');
    expect(describeAAError('AA33 reverted')).toMatch(/validation reverted/);
    expect(describeAAError('AA15 initCode must create sender')).toMatch(/expected account/);
    expect(describeAAError('AA36 over paymasterVerificationGasLimit')).toMatch(/Sponsor verification/);
    expect(describeAAError('AA95 out of gas')).toMatch(/AA95/);
  });
  it('N4: request times out via AbortController', async () => {
    const hang = ((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))) as never;
    const b = new BundlerClient(URL, 84532, ENTRY_POINT_V07, hang, 20);
    await expect(b.gasPrice()).rejects.toThrow(/timed out after 20 ms/);
  });
  it('N5: session signer on an undeployed account is rejected before any bundler call', async () => {
    const { p, mock } = mk({}, false);
    await expect(p.buildUserOperation(call, sessionSigner(SID, PK))).rejects.toThrow(/deployed account/);
    expect(mock.calls).toHaveLength(0);
  });
});
