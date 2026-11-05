import { decodeFunctionData, encodeFunctionData, getAddress, parseAbi, recoverMessageAddress, slice, type Hex, type PublicClient } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { getUserOperationHash } from 'viem/account-abstraction';
import { baseSepolia } from 'viem/chains';

import { accountFactoryAbi } from '@/modules/smartAccount/abis';
import { BundlerClient, BundlerNotConfiguredError, BundlerRpcError } from '@/modules/smartAccount/client';
import { BASE_SEPOLIA_CONTRACTS as C, ENTRY_POINT_V07, SMART_ACCOUNT_CONFIG } from '@/modules/smartAccount/config';
import { DEFAULT_SALT, encodeInitData, nonceKeyFor, predictAccountAddress, STUB_SIGNATURE } from '@/modules/smartAccount/encoding';
import { describeAAError } from '@/modules/smartAccount/errors';
import { createMockBundler, MOCK_PAYMASTER } from '@/modules/smartAccount/mock-bundler';
import { prepareSessionInstall, SessionKeyStore, sessionSigner, type SessionConfig } from '@/modules/smartAccount/sessions';
import type { UserOperation } from '@/modules/smartAccount/types';
import { VaultLiteSmartAccountProvider } from '@/modules/smartAccount/VaultLiteSmartAccountProvider';
import { MemoryKV } from '@/vault/storage';

const owner = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 0 });
const ACCOUNT: Hex = '0x9fC283814D91Aa88fcA0C6c60d1e868b582ca0dd'; // factory.getAddress, read on Base Sepolia 2026-10-28
const URL = 'https://proxy.test/api/bundler/84532';
const ESCROW: Hex = '0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528'; // MilestoneEscrow (not a module)

/** Offline stand-in for the Base Sepolia public client: factory.getAddress via local CREATE2, getNonce, getCode. */
function fakeChain({ deployed = false, seq = 0n } = {}) {
  return {
    chain: baseSepolia,
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      if (functionName === 'getAddress') return predictAccountAddress(args[0] as Hex, args[1] as Hex);
      if (functionName === 'getNonce') return ((args[1] as bigint) << 64n) | seq;
      throw new Error(`unexpected read ${functionName}`);
    },
    getCode: async () => (deployed ? '0x6080' : undefined),
  } as unknown as PublicClient;
}
const cfg = { ...SMART_ACCOUNT_CONFIG.baseSepolia!, bundlerUrl: URL };
const provider = (o: { deployed?: boolean; sponsor?: false; mock?: ReturnType<typeof createMockBundler> } = {}) => {
  const mock = o.mock ?? createMockBundler({ expectSigner: owner.address });
  const p = new VaultLiteSmartAccountProvider(cfg, fakeChain({ deployed: o.deployed }), owner, {
    bundler: new BundlerClient(URL, 84532, ENTRY_POINT_V07, mock.fetcher),
    ...(o.sponsor === false ? { sponsor: false } : {}),
  });
  return { p, mock };
};

describe('userOpHash', () => {
  // Vectors computed by EntryPoint v0.7 getUserOpHash(packed op) via eth_call on Base Sepolia (2026-10-29).
  const base: UserOperation = {
    sender: ACCOUNT,
    nonce: nonceKeyFor(C.ecdsaOwnerValidator) << 64n,
    factory: C.accountFactory,
    factoryData: '0xdeadbeef',
    callData: '0x1234',
    callGasLimit: 100000n,
    verificationGasLimit: 500000n,
    preVerificationGas: 60000n,
    maxFeePerGas: 1200000n,
    maxPriorityFeePerGas: 1000000n,
    paymaster: MOCK_PAYMASTER,
    paymasterVerificationGasLimit: 40000n,
    paymasterPostOpGasLimit: 1n,
    paymasterData: '0xabcdef',
    signature: '0x',
  };
  const h = (op: UserOperation) => getUserOperationHash({ userOperation: op, entryPointAddress: ENTRY_POINT_V07, entryPointVersion: '0.7', chainId: 84532 });
  it('matches EntryPoint.getUserOpHash (initCode + paymaster)', () => {
    expect(h(base)).toBe('0x8aab9f29272315e42563e03beed3d8bbfdb59d3379fc4f7ae3f625d6d7cb1018');
  });
  it('matches EntryPoint.getUserOpHash (deployed, unsponsored)', () => {
    const op = { ...base, factory: undefined, factoryData: undefined, paymaster: undefined, paymasterVerificationGasLimit: undefined, paymasterPostOpGasLimit: undefined, paymasterData: undefined };
    expect(h(op)).toBe('0x43e474bffba65445afc357b866fc7d7677f671f2ca7a68895b6cc00475e15f19');
  });
  it('provider.userOpHash is the same function', () => {
    expect(provider().p.userOpHash(base)).toBe(h(base));
  });
});

describe('build + sign + send via mock bundler proxy', () => {
  const call = [{ to: owner.address as Hex, value: 0n }];

  it('undeployed: factory + createAccount(initData, salt) factoryData, nonce key = ECDSA validator', async () => {
    const { p } = provider();
    const op = await p.buildUserOperation(call);
    expect(op.sender).toBe(ACCOUNT);
    expect(getAddress(op.factory!)).toBe(getAddress(C.accountFactory));
    const d = decodeFunctionData({ abi: accountFactoryAbi, data: op.factoryData! });
    expect(d.functionName).toBe('createAccount');
    expect(d.args).toEqual([encodeInitData(owner.address), DEFAULT_SALT]);
    expect(op.nonce >> 64n).toBe(nonceKeyFor(C.ecdsaOwnerValidator));
  });

  it('deployed: no factory fields', async () => {
    const { p } = provider({ deployed: true });
    const op = await p.buildUserOperation(call);
    expect(op.factory).toBeUndefined();
    expect(op.factoryData).toBeUndefined();
  });

  it('sponsored: ERC-7677 stub → estimate → final paymaster data, signed after paymaster fields', async () => {
    const { p, mock } = provider();
    const op = await p.buildUserOperation(call);
    expect(mock.methods()).toEqual(['eth_supportedEntryPoints', 'pimlico_getUserOperationGasPrice', 'pm_getPaymasterStubData', 'eth_estimateUserOperationGas', 'pm_getPaymasterData']);
    expect(op.paymaster).toBe(MOCK_PAYMASTER);
    expect(op.paymasterData).toBe('0x' + 'ab'.repeat(32));
    expect(op.paymasterVerificationGasLimit).toBe(0x9c40n);
    expect(op.paymasterPostOpGasLimit).toBe(1n);
    expect(op.maxFeePerGas).toBe(0x124f80n);
    expect(op.verificationGasLimit).toBe(0x7a120n);
    // pm stub call carries entryPoint + chainId (ERC-7677 params)
    const stub = mock.calls.find((c) => c.method === 'pm_getPaymasterStubData')!;
    expect(stub.params.slice(1, 3)).toEqual([ENTRY_POINT_V07, '0x14a34']);
    // signature: EIP-191 over the hash of the FINAL op (incl. paymasterData)
    expect(await recoverMessageAddress({ message: { raw: p.userOpHash(op) }, signature: op.signature })).toBe(owner.address);
  });

  it('isFinal stub skips pm_getPaymasterData', async () => {
    const mock = createMockBundler({ stubIsFinal: true });
    const { p } = provider({ mock });
    await p.buildUserOperation(call);
    expect(mock.methods()).not.toContain('pm_getPaymasterData');
  });

  it('unsponsored: no pm_* calls and no paymaster fields', async () => {
    const { p, mock } = provider({ sponsor: false });
    const op = await p.buildUserOperation(call);
    expect(mock.methods().some((m) => m.startsWith('pm_'))).toBe(false);
    expect(op.paymaster).toBeUndefined();
  });

  it('send: bundler hash equals local userOpHash; receipt polling', async () => {
    const mock = createMockBundler({ expectSigner: owner.address, receiptAfterPolls: 1 });
    const { p } = provider({ mock });
    const { userOpHash } = await p.sendUserOperation(call);
    expect(userOpHash).toBe(p.userOpHash(mock.sent[0]));
    const r = await p.bundler.waitForReceipt(userOpHash, { pollMs: 0, sleep: async () => {} });
    expect(r).toMatchObject({ success: true, paymaster: MOCK_PAYMASTER });
  });

  it('wrong signer is rejected with AA24 and readable hint', async () => {
    const mock = createMockBundler({ expectSigner: '0x000000000000000000000000000000000000dEaD' });
    const { p } = provider({ mock });
    const e = await p.sendUserOperation(call).catch((x) => x);
    expect(e).toBeInstanceOf(BundlerRpcError);
    expect(e.hint).toMatch(/Signature check failed/);
  });

  it('paymaster policy rejection (AA33) surfaces as BundlerRpcError', async () => {
    const mock = createMockBundler({ errors: { pm_getPaymasterStubData: 'AA33 reverted: policy' } });
    const e = await provider({ mock }).p.buildUserOperation(call).catch((x) => x);
    expect(e).toBeInstanceOf(BundlerRpcError);
    expect(e.method).toBe('pm_getPaymasterStubData');
    expect(describeAAError(e.message)).toMatch(/validation reverted/);
  });
});

describe('proxy URL unset', () => {
  it('every bundler call throws BundlerNotConfiguredError without any network request', async () => {
    const fetcher = jest.fn();
    const b = new BundlerClient(null, 84532, ENTRY_POINT_V07, fetcher as never);
    expect(b.configured).toBe(false);
    await expect(b.gasPrice()).rejects.toBeInstanceOf(BundlerNotConfiguredError);
    await expect(b.sendUserOperation({} as UserOperation)).rejects.toBeInstanceOf(BundlerNotConfiguredError);
    const p = new VaultLiteSmartAccountProvider({ ...cfg, bundlerUrl: null }, fakeChain(), owner);
    await expect(p.sendUserOperation([{ to: owner.address }])).rejects.toBeInstanceOf(BundlerNotConfiguredError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('BundlerClient.forChain reads only EXPO_PUBLIC_BUNDLER_PROXY_URL', () => {
    const prev = process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL;
    delete process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL;
    expect(BundlerClient.forChain(84532).url).toBeNull();
    process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL = 'https://proxy.example';
    expect(BundlerClient.forChain(84532).url).toBe('https://proxy.example/api/bundler/84532');
    if (prev === undefined) delete process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL;
    else process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL = prev;
  });
  it('non-JSON / network failures are typed errors', async () => {
    const bad = new BundlerClient(URL, 84532, ENTRY_POINT_V07, (async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })) as never);
    await expect(bad.gasPrice()).rejects.toThrow(/HTTP 502/);
    const down = new BundlerClient(URL, 84532, ENTRY_POINT_V07, (async () => { throw new Error('ECONNREFUSED'); }) as never);
    await expect(down.gasPrice()).rejects.toThrow(/unreachable/);
  });
});

describe('session keys', () => {
  const sessionId: Hex = `0x${'5e'.repeat(32)}`;
  const cfgS: SessionConfig = {
    sessionKey: '0x1111111111111111111111111111111111111111',
    validAfter: 0,
    validUntil: 2_000_000_000,
    maxUses: 5,
    nativeCap: 0n,
    salt: DEFAULT_SALT,
    permissions: [{ target: ESCROW, selector: '0x12345678' }],
    tokenCaps: [],
  };

  it('session op: nonce key = SessionKeyValidator, signature = sessionId ‖ EIP-191 sig (97 bytes)', async () => {
    const pk: Hex = `0x${'42'.repeat(32)}`;
    const signer = sessionSigner(sessionId, pk);
    const mock = createMockBundler({ expectSigner: privateKeyToAccount(pk).address, sigPrefixBytes: 32 });
    const { p } = provider({ deployed: true, mock });
    const op = await p.buildUserOperation([{ to: C.escrowExecutor, data: '0x12345678' }], signer);
    expect(op.nonce >> 64n).toBe(nonceKeyFor(C.sessionKeyValidator));
    expect((op.signature.length - 2) / 2).toBe(97);
    expect(slice(op.signature, 0, 32)).toBe(sessionId);
    // stub used for estimation also has the session layout
    const est = mock.calls.find((c) => c.method === 'eth_estimateUserOperationGas')!.params[0] as { signature: Hex };
    expect(est.signature).toBe(`${sessionId}${STUB_SIGNATURE.slice(2)}`);
    await expect(p.bundler.sendUserOperation(op)).resolves.toBe(p.userOpHash(op));
  });

  it('install / enable calls encode the SessionConfig', async () => {
    const noModules = { readContract: async () => false } as never;
    const inst = await prepareSessionInstall(noModules, ACCOUNT, cfgS, { validatorInstalled: false });
    expect(inst.to).toBe(ACCOUNT);
    const abi = parseAbi(['function installModule(uint256 moduleTypeId, address module, bytes initData)']);
    const d = decodeFunctionData({ abi, data: inst.data! });
    expect(d.args?.[0]).toBe(1n);
    expect(getAddress(d.args![1] as Hex)).toBe(getAddress(C.sessionKeyValidator));
    const en = await prepareSessionInstall(noModules, ACCOUNT, cfgS, { validatorInstalled: true });
    expect(getAddress(en.to)).toBe(getAddress(C.sessionKeyValidator));
    expect(en.data!.slice(0, 10)).toBe(encodeFunctionData({ abi: parseAbi(['function enableSession((address,uint48,uint48,uint32,uint128,bytes32,(address,bytes4)[],(address,uint128)[]))']), args: [[cfgS.sessionKey, 0, 2_000_000_000, 5, 0n, DEFAULT_SALT, [[ESCROW, '0x12345678']], []]] }).slice(0, 10));
  });

  it('SessionKeyStore: key stored with requireAuth, signer only after sessionId, expiry deletes key', async () => {
    const kv = new MemoryKV();
    const setSpy = jest.spyOn(kv, 'set');
    let now = 1_000;
    const store = new SessionKeyStore(kv, () => now);
    const meta = await store.create(ACCOUNT, { salt: DEFAULT_SALT, ttlSeconds: 60 });
    expect((setSpy.mock.calls as unknown[][]).find((c) => String(c[0]).endsWith('.pk'))?.[2]).toEqual({ requireAuth: true });
    expect(await store.signer(ACCOUNT, meta.sessionKey, [{ to: ESCROW, data: '0x12345678' }])).toBeNull(); // no sessionId yet
    await store.setSessionId(ACCOUNT, meta.sessionKey, sessionId);
    const s = await store.signer(ACCOUNT, meta.sessionKey, [{ to: ESCROW, data: '0x12345678' }]);
    expect(s?.validator).toBe(C.sessionKeyValidator);
    now = 2_000;
    expect(await store.signer(ACCOUNT, meta.sessionKey, [{ to: ESCROW, data: '0x12345678' }])).toBeNull();
    expect(await store.list(ACCOUNT)).toEqual([]);
  });

  it('corrupt metadata is treated as empty', async () => {
    const kv = new MemoryKV();
    await kv.set(`vaultlite.session.${ACCOUNT.toLowerCase()}.meta`, '{bad');
    expect(await new SessionKeyStore(kv).list(ACCOUNT)).toEqual([]);
  });
});
