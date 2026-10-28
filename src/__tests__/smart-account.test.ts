import fs from 'fs';

import {
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  hashMessage,
  http,
  recoverAddress,
  recoverMessageAddress,
  toFunctionSelector,
  type AbiFunction,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { accountFactoryAbi, ecdsaValidatorAbi, sessionKeyValidatorAbi, smartAccountAbi } from '@/modules/smartAccount/abis';
import { BASE_SEPOLIA_CONTRACTS as C, SMART_ACCOUNT_CONFIG } from '@/modules/smartAccount/config';
import {
  accountMessageDigest,
  DEFAULT_SALT,
  encodeExecute,
  encodeFactoryData,
  encodeInitData,
  MODE_BATCH,
  MODE_SINGLE,
  nonceKeyFor,
  predictAccountAddress,
} from '@/modules/smartAccount/encoding';
import { BundlerNotConfiguredError, VaultLiteSmartAccountProvider } from '@/modules/smartAccount/VaultLiteSmartAccountProvider';
import type { UserOperation } from '@/modules/smartAccount/types';

const MNEMONIC = 'test test test test test test test test test test test junk';
const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 0 }); // m/44'/60'/0'/0/0
const EXPECTED_OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
/** Read from AccountFactory.getAddress on Base Sepolia (scripts/verify-smart-account.ts, 2026-10-28). */
const COUNTERFACTUAL = '0x9fC283814D91Aa88fcA0C6c60d1e868b582ca0dd';

describe('init data', () => {
  it('owner is m/44\'/60\'/0\'/0/0', () => expect(owner.address).toBe(EXPECTED_OWNER));

  it('encodes initialize([ECDSA validator(owner)])', () => {
    const data = encodeInitData(owner.address);
    const { functionName, args } = decodeFunctionData({ abi: smartAccountAbi, data });
    expect(functionName).toBe('initialize');
    const [mods] = args as [readonly { moduleTypeId: bigint; module: string; initData: `0x${string}` }[]];
    expect(mods).toHaveLength(1);
    expect(mods[0].moduleTypeId).toBe(1n);
    expect(getAddress(mods[0].module)).toBe(getAddress(C.ecdsaOwnerValidator));
    expect(decodeAbiParameters([{ type: 'address' }], mods[0].initData)[0]).toBe(EXPECTED_OWNER);
  });

  it('factory data wraps createAccount(initData, salt)', () => {
    const init = encodeInitData(owner.address);
    const { functionName, args } = decodeFunctionData({ abi: accountFactoryAbi, data: encodeFactoryData(init) });
    expect(functionName).toBe('createAccount');
    expect(args).toEqual([init, DEFAULT_SALT]);
  });

  it('execute modes and nonce key', () => {
    const one = decodeFunctionData({ abi: smartAccountAbi, data: encodeExecute([{ to: EXPECTED_OWNER, value: 1n }]) });
    expect(one.args?.[0]).toBe(MODE_SINGLE);
    expect((one.args?.[1] as string).length).toBe(2 + 2 * (20 + 32));
    const two = decodeFunctionData({ abi: smartAccountAbi, data: encodeExecute([{ to: EXPECTED_OWNER }, { to: EXPECTED_OWNER, data: '0x1234' }]) });
    expect(two.args?.[0]).toBe(MODE_BATCH);
    expect(nonceKeyFor(C.ecdsaOwnerValidator)).toBe(BigInt(C.ecdsaOwnerValidator) << 32n);
  });
});

it('local CREATE2 prediction equals the on-chain factory.getAddress result', () => {
  expect(predictAccountAddress(encodeInitData(owner.address))).toBe(COUNTERFACTUAL);
  expect(predictAccountAddress(encodeInitData(owner.address), `0x${'01'.padStart(64, '0')}`)).not.toBe(COUNTERFACTUAL);
});

describe('signatures', () => {
  const op: UserOperation = {
    sender: '0x1111111111111111111111111111111111111111',
    nonce: 0n,
    callData: '0x',
    callGasLimit: 100000n,
    verificationGasLimit: 300000n,
    preVerificationGas: 50000n,
    maxFeePerGas: 1000000n,
    maxPriorityFeePerGas: 1000000n,
    signature: '0x',
  };
  const client = createPublicClient({ chain: baseSepolia, transport: http('http://127.0.0.1:1') });
  const p = new VaultLiteSmartAccountProvider({ ...SMART_ACCOUNT_CONFIG.baseSepolia!, bundlerUrl: null }, client as never, owner);

  it('userOp signature recovers the owner with an EIP-191 hash', async () => {
    const hash = p.userOpHash(op);
    const sig = await p.signUserOperation(op);
    expect(await recoverAddress({ hash: hashMessage({ raw: hash }), signature: sig })).toBe(EXPECTED_OWNER);
    expect(await recoverMessageAddress({ message: { raw: hash }, signature: sig })).toBe(EXPECTED_OWNER);
    // and NOT over the raw hash
    expect(await recoverAddress({ hash, signature: sig })).not.toBe(EXPECTED_OWNER);
  });

  it('bundler not configured is a clear typed error', async () => {
    await expect(p.buildUserOperation([{ to: EXPECTED_OWNER }])).rejects.toBeInstanceOf(BundlerNotConfiguredError);
    expect(p.bundlerConfigured).toBe(false);
  });
});

const OUT = '/workspace/smart-account/out';
(fs.existsSync(OUT) ? describe : describe.skip)('ABIs match compiled artifacts', () => {
  const sel = (abi: readonly unknown[]) =>
    (abi as AbiFunction[]).filter((x) => x.type === 'function').map((f) => toFunctionSelector(f));
  const art = (n: string) => sel(JSON.parse(fs.readFileSync(`${OUT}/${n}.sol/${n}.json`, 'utf8')).abi);
  it.each([
    ['AccountFactory', accountFactoryAbi],
    ['SmartAccount', smartAccountAbi],
    ['ECDSAOwnerValidator', ecdsaValidatorAbi],
    ['SessionKeyValidator', sessionKeyValidatorAbi],
  ] as const)('%s', (name, abi) => {
    const have = art(name);
    for (const s of sel(abi)) expect(have).toContain(s);
  });
});

// Real Base Sepolia reads: opt-in with ONCHAIN=1 (jest-expo env cannot reach the network here; see scripts/verify-smart-account.ts).
const live = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org', { timeout: 15_000 }) });
(process.env.ONCHAIN === '1' ? describe : describe.skip)('Base Sepolia (live eth_call)', () => {
  jest.setTimeout(30_000);
  const p = new VaultLiteSmartAccountProvider({ ...SMART_ACCOUNT_CONFIG.baseSepolia!, bundlerUrl: null }, live as never, owner);

  it('factory wiring', async () => {
    const [impl, ep] = await Promise.all([
      live.readContract({ address: C.accountFactory, abi: accountFactoryAbi, functionName: 'implementation' }),
      live.readContract({ address: C.accountFactory, abi: accountFactoryAbi, functionName: 'ENTRY_POINT' }),
    ]);
    expect(getAddress(impl)).toBe(getAddress(C.smartAccountImpl));
    expect(ep).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032');
  });

  it('counterfactual address from factory.getAddress; nonce 0 while undeployed', async () => {
    const addr = await p.getAddress();
    expect(addr).toBe(COUNTERFACTUAL);
    console.log('counterfactual', addr);
    if (!(await p.isDeployed())) expect(await p.getNonce()).toBe(0n);
  });

  it('local EIP-712 digest matches ECDSAOwnerValidator.accountMessageDigest', async () => {
    const acct = await p.getAddress();
    const h = hashMessage('vaultlite');
    const onchain = await live.readContract({ address: C.ecdsaOwnerValidator, abi: ecdsaValidatorAbi, functionName: 'accountMessageDigest', args: [acct, h] });
    expect(accountMessageDigest(acct, h, 84532)).toBe(onchain);
  });
});
