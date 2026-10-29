/**
 * ERC-4337 bundler + ERC-7677 paymaster JSON-RPC client. Talks ONLY to the bundler proxy
 * (EXPO_PUBLIC_BUNDLER_PROXY_URL/api/bundler/<chainId>); the proxy holds the Pimlico key server-side.
 */
import { toHex } from 'viem';

import { bundlerProxyUrl, ENTRY_POINT_V07 } from './config';
import { describeAAError } from './errors';
import type { Hex, UserOperation } from './types';

export class BundlerNotConfiguredError extends Error {
  readonly code = 'BUNDLER_NOT_CONFIGURED';
  constructor() {
    super('Bundler not configured: set EXPO_PUBLIC_BUNDLER_PROXY_URL to enable sending UserOperations.');
  }
}

export class BundlerRpcError extends Error {
  /** Human copy for AAxx EntryPoint errors (null when not an AA error). */
  readonly hint: string | null;
  constructor(readonly rpcCode: number | undefined, message: string, readonly method?: string) {
    super(message);
    this.hint = describeAAError(message);
  }
}

/** Unpacked v0.7 op in bundler JSON-RPC form (hex quantities, undefined fields dropped). */
export function toRpcUserOp(op: Partial<UserOperation>): Record<string, Hex> {
  const out: Record<string, Hex> = {};
  for (const [k, v] of Object.entries(op)) {
    if (v === undefined) continue;
    out[k] = (typeof v === 'bigint' ? toHex(v) : v) as Hex;
  }
  return out;
}

export interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}
export interface GasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
}
export interface PaymasterFields {
  paymaster: Hex;
  paymasterData: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  isFinal?: boolean;
}
export interface UserOpReceipt {
  success: boolean;
  txHash: Hex;
  actualGasCost?: bigint;
  paymaster?: Hex;
  reason?: string;
}

const big = (v: unknown) => (v === undefined || v === null ? undefined : BigInt(v as string));

export class BundlerClient {
  readonly url: string | null;
  private id = 0;

  constructor(
    url: string | null,
    readonly chainId: number,
    readonly entryPoint: Hex = ENTRY_POINT_V07,
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {
    this.url = url;
  }

  static forChain(chainId: number, fetcher?: typeof fetch) {
    return new BundlerClient(bundlerProxyUrl(chainId), chainId, ENTRY_POINT_V07, fetcher);
  }

  get configured() {
    return !!this.url;
  }

  async request<T>(method: string, params: unknown[]): Promise<T> {
    if (!this.url) throw new BundlerNotConfiguredError();
    let res: Response;
    try {
      res = await this.fetcher(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
      });
    } catch (e) {
      throw new BundlerRpcError(undefined, `Bundler proxy unreachable: ${(e as Error).message}`, method);
    }
    let j: { result?: T; error?: { code?: number; message?: string } };
    try {
      j = await res.json();
    } catch {
      throw new BundlerRpcError(res.status, `Bundler proxy HTTP ${res.status} (non-JSON response)`, method);
    }
    if (j.error) throw new BundlerRpcError(j.error.code, j.error.message ?? 'Bundler error', method);
    if (!res.ok) throw new BundlerRpcError(res.status, `Bundler proxy HTTP ${res.status}`, method);
    return j.result as T;
  }

  async gasPrice(): Promise<GasPrice> {
    const r = await this.request<{ fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } }>('pimlico_getUserOperationGasPrice', []);
    return { maxFeePerGas: BigInt(r.fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(r.fast.maxPriorityFeePerGas) };
  }

  private async pm(method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData', op: UserOperation, context?: Record<string, unknown>): Promise<PaymasterFields> {
    const r = await this.request<Record<string, unknown>>(method, [toRpcUserOp(op), this.entryPoint, toHex(this.chainId), context ?? {}]);
    if (!r?.paymaster) throw new BundlerRpcError(undefined, `${method}: no paymaster in response (v0.7 fields expected)`, method);
    return {
      paymaster: r.paymaster as Hex,
      paymasterData: (r.paymasterData as Hex) ?? '0x',
      paymasterVerificationGasLimit: big(r.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: big(r.paymasterPostOpGasLimit),
      isFinal: r.isFinal as boolean | undefined,
    };
  }
  /** ERC-7677 */
  paymasterStubData = (op: UserOperation, context?: Record<string, unknown>) => this.pm('pm_getPaymasterStubData', op, context);
  /** ERC-7677 */
  paymasterData = (op: UserOperation, context?: Record<string, unknown>) => this.pm('pm_getPaymasterData', op, context);

  async estimateGas(op: UserOperation): Promise<GasEstimate> {
    const g = await this.request<Record<string, Hex>>('eth_estimateUserOperationGas', [toRpcUserOp(op), this.entryPoint]);
    return {
      callGasLimit: BigInt(g.callGasLimit),
      verificationGasLimit: BigInt(g.verificationGasLimit),
      preVerificationGas: BigInt(g.preVerificationGas),
      paymasterVerificationGasLimit: big(g.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: big(g.paymasterPostOpGasLimit),
    };
  }

  sendUserOperation = (op: UserOperation) => this.request<Hex>('eth_sendUserOperation', [toRpcUserOp(op), this.entryPoint]);

  async getReceipt(hash: Hex): Promise<UserOpReceipt | null> {
    const r = await this.request<{ success: boolean; actualGasCost?: Hex; paymaster?: Hex; reason?: string; receipt: { transactionHash: Hex } } | null>(
      'eth_getUserOperationReceipt',
      [hash],
    );
    if (!r) return null;
    return { success: r.success, txHash: r.receipt.transactionHash, actualGasCost: big(r.actualGasCost), paymaster: r.paymaster, reason: r.reason };
  }

  async waitForReceipt(hash: Hex, { timeoutMs = 120_000, pollMs = 2_000, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {}): Promise<UserOpReceipt> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const r = await this.getReceipt(hash);
      if (r) return r;
      if (Date.now() >= end) throw new Error('Timed out waiting for UserOperation receipt');
      await sleep(pollMs);
    }
  }
}
