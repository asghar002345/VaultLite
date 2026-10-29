/** Pure encoders for the VaultLite ERC-7579 account (no network, no RN deps). */
import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  hashTypedData,
  keccak256,
  pad,
  toHex,
  type Hex,
} from 'viem';

import { accountFactoryAbi, smartAccountAbi } from './abis';
import { BASE_SEPOLIA_CONTRACTS as C } from './config';
import type { Call } from './types';

export const MODULE_TYPE_VALIDATOR = 1n;
export const MODULE_TYPE_EXECUTOR = 2n;
export const DEFAULT_SALT: Hex = pad('0x0', { size: 32 });

export interface ModuleInit {
  moduleTypeId: bigint;
  module: Hex;
  initData: Hex;
}

/** SmartAccount.initialize(ModuleInit[]) with the ECDSA owner validator first (required). */
export function encodeInitData(owner: Hex, extra: ModuleInit[] = []): Hex {
  const modules: ModuleInit[] = [
    { moduleTypeId: MODULE_TYPE_VALIDATOR, module: C.ecdsaOwnerValidator, initData: encodeAbiParameters([{ type: 'address' }], [owner]) },
    ...extra,
  ];
  return encodeFunctionData({ abi: smartAccountAbi, functionName: 'initialize', args: [modules] });
}

export const encodeFactoryData = (initData: Hex, salt: Hex = DEFAULT_SALT): Hex =>
  encodeFunctionData({ abi: accountFactoryAbi, functionName: 'createAccount', args: [initData, salt] });

/** ERC-7579 modes: callType(1)|execType(1)|unused(4)|selector(4)|payload(22). */
export const MODE_SINGLE: Hex = pad('0x00', { dir: 'right', size: 32 });
export const MODE_BATCH: Hex = pad('0x01', { dir: 'right', size: 32 });

export function encodeExecute(calls: Call[]): Hex {
  if (calls.length === 0) throw new Error('No calls');
  if (calls.length === 1) {
    const c = calls[0];
    const exec = concat([c.to, pad(toHex(c.value ?? 0n), { size: 32 }), c.data ?? '0x']);
    return encodeFunctionData({ abi: smartAccountAbi, functionName: 'execute', args: [MODE_SINGLE, exec] });
  }
  const exec = encodeAbiParameters(
    [{ type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }] }],
    [calls.map((c) => ({ target: c.to, value: c.value ?? 0n, callData: c.data ?? '0x' }))],
  );
  return encodeFunctionData({ abi: smartAccountAbi, functionName: 'execute', args: [MODE_BATCH, exec] });
}

/** uint192 nonce key: validator(20) | key(4). */
export const nonceKeyFor = (validator: Hex, key = 0): bigint => (BigInt(validator) << 32n) | BigInt(key >>> 0);

/** Same digest as ECDSAOwnerValidator.accountMessageDigest(account, hash). */
export function accountMessageDigest(account: Hex, hash: Hex, chainId: number): Hex {
  return hashTypedData({
    domain: { name: 'VaultLiteECDSAValidator', version: '1', chainId, verifyingContract: account },
    types: { AccountMessage: [{ name: 'hash', type: 'bytes32' }] },
    primaryType: 'AccountMessage',
    message: { hash },
  });
}

/** OZ AccountERC7579.isValidSignature expects validator(20) ++ signature. */
export const wrapErc1271Signature = (validator: Hex, sig: Hex): Hex => concat([validator, sig]);

/**
 * 65-byte dummy for gas estimation, same as smart-account e2e/e2e.ts: well-formed (low s), recovers to a
 * random address, so the validator returns SIG_VALIDATION_FAILED instead of reverting.
 */
export const STUB_SIGNATURE: Hex = concat([
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0x1c',
]);



/** Local mirror of AccountFactory.getAddress: OZ Clones.predictDeterministicAddress(impl, keccak256(keccak256(initData) ++ salt)). */
export function predictAccountAddress(initData: Hex, salt: Hex = DEFAULT_SALT, impl: Hex = C.smartAccountImpl, factory: Hex = C.accountFactory): Hex {
  const s = keccak256(concat([keccak256(initData), salt]));
  const bytecode = concat(['0x3d602d80600a3d3981f3363d3d373d3d3d363d73', impl, '0x5af43d82803e903d91602b57fd5bf3']);
  return getContractAddress({ opcode: 'CREATE2', from: factory, salt: s, bytecode });
}
