/**
 * In-memory mock of the bundler proxy (bundler + ERC-7677 paymaster JSON-RPC) for tests and dev.
 * Not a real bundler: no simulation. It checks request shape, computes the v0.7 userOpHash itself,
 * and (optionally) verifies the signature recovers the expected signer before "accepting" the op.
 */
import { recoverMessageAddress, type Hex } from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';

import { BUNDLER_METHODS } from './client';
import { ENTRY_POINT_V07 } from './config';
import type { UserOperation } from './types';

export const MOCK_PAYMASTER: Hex = '0x777777777777AeC03fd955926DbF81597e66834C';

export interface MockBundlerOptions {
  chainId?: number;
  /** Return a JSON-RPC error for these methods: { method: message }. */
  errors?: Record<string, string>;
  /** Expected owner/session signer; sendUserOperation rejects (AA24) otherwise. */
  expectSigner?: Hex;
  /** Signature prefix length (bytes) before the 65-byte ECDSA sig (32 for session keys). */
  sigPrefixBytes?: number;
  stubIsFinal?: boolean;
  /** Realistic ERC-7677: pm_getPaymasterData returns only paymaster + paymasterData (no gas limits). */
  pmDataNoGas?: boolean;
  /** Answer pm_* with the proxy's 403 not_sponsorable (-32002). */
  notSponsorable?: boolean;
  supportedEntryPoints?: Hex[];
  /** Return this hash from eth_sendUserOperation instead of the real one. */
  tamperHash?: Hex;
  receiptAfterPolls?: number;
}

export interface RecordedCall {
  method: string;
  params: unknown[];
}

const fromRpc = (o: Record<string, Hex>): UserOperation => {
  const b = (k: string) => (o[k] === undefined ? undefined : BigInt(o[k]));
  return {
    sender: o.sender,
    nonce: b('nonce')!,
    factory: o.factory,
    factoryData: o.factoryData,
    callData: o.callData,
    callGasLimit: b('callGasLimit')!,
    verificationGasLimit: b('verificationGasLimit')!,
    preVerificationGas: b('preVerificationGas')!,
    maxFeePerGas: b('maxFeePerGas')!,
    maxPriorityFeePerGas: b('maxPriorityFeePerGas')!,
    paymaster: o.paymaster,
    paymasterVerificationGasLimit: b('paymasterVerificationGasLimit'),
    paymasterPostOpGasLimit: b('paymasterPostOpGasLimit'),
    paymasterData: o.paymasterData,
    signature: o.signature,
  };
};

export function createMockBundler(opts: MockBundlerOptions = {}) {
  const chainId = opts.chainId ?? 84532;
  const calls: RecordedCall[] = [];
  const sent: UserOperation[] = [];
  let polls = 0;

  const handle = async (method: string, params: unknown[]): Promise<unknown> => {
    // Mirrors the proxy method allowlist (docs/BUNDLER_PROXY.md §2, without pm_sponsorUserOperation).
    if (!(BUNDLER_METHODS as readonly string[]).includes(method)) throw { code: -32001, message: 'method_not_allowed', data: { reason: `${method} is not allowlisted` } };
    if (opts.errors?.[method]) throw { code: -32500, message: opts.errors[method] };
    if (opts.notSponsorable && method.startsWith('pm_')) throw { code: -32002, message: 'not_sponsorable', data: { reason: 'target not allowlisted' } };
    switch (method) {
      case 'eth_supportedEntryPoints':
        return opts.supportedEntryPoints ?? [ENTRY_POINT_V07];
      case 'pimlico_getUserOperationGasPrice':
        return { slow: { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x1' }, standard: { maxFeePerGas: '0x2', maxPriorityFeePerGas: '0x1' }, fast: { maxFeePerGas: '0x124f80', maxPriorityFeePerGas: '0xf4240' } };
      case 'pm_getPaymasterStubData':
        return { paymaster: MOCK_PAYMASTER, paymasterData: '0x' + '00'.repeat(32), paymasterVerificationGasLimit: '0x9c40', paymasterPostOpGasLimit: '0x1', isFinal: !!opts.stubIsFinal };
      case 'pm_getPaymasterData':
        if (opts.pmDataNoGas) return { paymaster: MOCK_PAYMASTER, paymasterData: '0x' + 'ab'.repeat(32) };
        return { paymaster: MOCK_PAYMASTER, paymasterData: '0x' + 'ab'.repeat(32), paymasterVerificationGasLimit: '0x9c40', paymasterPostOpGasLimit: '0x1' };
      case 'eth_estimateUserOperationGas': {
        const op = params[0] as Record<string, Hex>;
        return { callGasLimit: '0x186a0', verificationGasLimit: op.factory ? '0x7a120' : '0x186a0', preVerificationGas: '0xea60', ...(op.paymaster ? { paymasterVerificationGasLimit: '0xafc8', paymasterPostOpGasLimit: '0x1' } : {}) };
      }
      case 'eth_sendUserOperation': {
        const [rpcOp, ep] = params as [Record<string, Hex>, Hex];
        if (ep.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()) throw { code: -32602, message: 'unsupported entrypoint' };
        const op = fromRpc(rpcOp);
        const hash = getUserOperationHash({ userOperation: op, entryPointAddress: ENTRY_POINT_V07, entryPointVersion: '0.7', chainId });
        if (opts.expectSigner) {
          const pre = (opts.sigPrefixBytes ?? 0) * 2;
          const sig = `0x${op.signature.slice(2 + pre)}` as Hex;
          const who = sig.length === 132 ? await recoverMessageAddress({ message: { raw: hash }, signature: sig }) : null;
          if (who?.toLowerCase() !== opts.expectSigner.toLowerCase()) throw { code: -32507, message: 'UserOperation reverted during simulation with reason: AA24 signature error' };
        }
        sent.push(op);
        return opts.tamperHash ?? hash;
      }
      case 'eth_getUserOperationReceipt': {
        polls++;
        if (polls <= (opts.receiptAfterPolls ?? 0)) return null;
        return { success: true, actualGasCost: '0x10', paymaster: MOCK_PAYMASTER, receipt: { transactionHash: '0x' + '11'.repeat(32) } };
      }
      case 'pimlico_getUserOperationStatus':
        return { status: 'included', transactionHash: '0x' + '11'.repeat(32) };
      case 'eth_getUserOperationByHash':
        return null;
      default:
        throw { code: -32601, message: `unhandled: ${method}` };
    }
  };

  const fetcher = (async (_url: string, init?: { body?: string }) => {
    const req = JSON.parse(init?.body ?? '{}') as { id: number; method: string; params: unknown[] };
    calls.push({ method: req.method, params: req.params });
    let body: unknown;
    try {
      body = { jsonrpc: '2.0', id: req.id, result: await handle(req.method, req.params) };
    } catch (e) {
      body = { jsonrpc: '2.0', id: req.id, error: e };
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;

  return { fetcher, calls, sent, methods: () => calls.map((c) => c.method) };
}
