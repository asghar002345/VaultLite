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
  constructor(readonly rpcCode: number | undefined, message: string, readonly method?: string, readonly reason?: string) {
    super(reason ? `${message}: ${reason}` : message);
    this.hint = describeAAError(this.message);
  }
  /** Proxy refused sponsorship (docs/BUNDLER_PROXY.md: 403 / -32002 not_sponsorable). The op may still be sent self-paid. */
  get notSponsorable(): boolean {
    return this.rpcCode === -32002 || /not_sponsorable/.test(this.message);
  }
}

export class EntryPointNotSupportedError extends Error {
  constructor(readonly supported: Hex[]) {
    super(`Bundler proxy does not support EntryPoint v0.7 (supports: ${supported.join(', ') || 'none'})`);
  }
}

/** Methods this client may call. Mirrors the proxy allowlist (docs/BUNDLER_PROXY.md §2) minus pm_sponsorUserOperation. */
export const BUNDLER_METHODS = [
  'eth_sendUserOperation',
  'eth_estimateUserOperationGas',
  'eth_getUserOperationReceipt',
  'eth_getUserOperationByHash',
  'eth_supportedEntryPoints',
  'pimlico_getUserOperationGasPrice',
  'pimlico_getUserOperationStatus',
  'pm_getPaymasterStubData',
  'pm_getPaymasterData',
] as const;
export type BundlerMethod = (typeof BUNDLER_METHODS)[number];

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
/** Copy only keys whose value is defined, so a partial response never overwrites earlier values with undefined. */
export const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const SUPPORTED_EP_TTL_MS = 3600_000;

export class BundlerClient {
  readonly url: string | null;
  private id = 0;
  private epCheck?: { at: number; ok: Promise<void> };

  constructor(
    url: string | null,
    readonly chainId: number,
    readonly entryPoint: Hex = ENTRY_POINT_V07,
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
    readonly timeoutMs = 20_000,
  ) {
    this.url = url;
  }

  static forChain(chainId: number, fetcher?: typeof fetch) {
    return new BundlerClient(bundlerProxyUrl(chainId), chainId, ENTRY_POINT_V07, fetcher);
  }

  get configured() {
    return !!this.url;
  }

  async request<T>(method: BundlerMethod, params: unknown[]): Promise<T> {
    if (!this.url) throw new BundlerNotConfiguredError();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetcher(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
        signal: ctl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = ctl.signal.aborted ? `timed out after ${this.timeoutMs} ms` : (e as Error).message;
      throw new BundlerRpcError(undefined, `Bundler proxy unreachable: ${msg}`, method);
    }
    let j: { result?: T; error?: { code?: number; message?: string; data?: { reason?: string } } };
    try {
      j = await res.json();
    } catch {
      throw new BundlerRpcError(res.status, `Bundler proxy HTTP ${res.status} (non-JSON response)`, method);
    } finally {
      clearTimeout(timer);
    }
    if (j.error) throw new BundlerRpcError(j.error.code, j.error.message ?? 'Bundler error', method, j.error.data?.reason);
    if (!res.ok) throw new BundlerRpcError(res.status, `Bundler proxy HTTP ${res.status}`, method);
    return j.result as T;
  }

  /** eth_supportedEntryPoints must include EntryPoint v0.7; cached 1 h (proxy marks it cacheable). Failures are not cached. */
  assertEntryPointSupported(now = Date.now()): Promise<void> {
    if (this.epCheck && now - this.epCheck.at < SUPPORTED_EP_TTL_MS) return this.epCheck.ok;
    const ok = this.request<Hex[]>('eth_supportedEntryPoints', []).then((eps) => {
      if (!eps.some((e) => e.toLowerCase() === this.entryPoint.toLowerCase())) throw new EntryPointNotSupportedError(eps);
    });
    this.epCheck = { at: now, ok };
    ok.catch(() => {
      if (this.epCheck?.ok === ok) this.epCheck = undefined;
    });
    return ok;
  }

  async gasPrice(): Promise<GasPrice> {
    const r = await this.request<{ fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } }>('pimlico_getUserOperationGasPrice', []);
    return { maxFeePerGas: BigInt(r.fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(r.fast.maxPriorityFeePerGas) };
  }

  private async pm(method: 'pm_getPaymasterStubData' | 'pm_getPaymasterData', op: UserOperation, context?: Record<string, unknown>): Promise<PaymasterFields> {
    const r = await this.request<Record<string, unknown>>(method, [toRpcUserOp(op), this.entryPoint, toHex(this.chainId), context ?? {}]);
    if (!r?.paymaster) throw new BundlerRpcError(undefined, `${method}: no paymaster in response (v0.7 fields expected)`, method);
    // ERC-7677 pm_getPaymasterData usually returns only paymaster + paymasterData: omit absent gas keys entirely.
    return definedOnly({
      paymaster: r.paymaster as Hex,
      paymasterData: (r.paymasterData as Hex) ?? '0x',
      paymasterVerificationGasLimit: big(r.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: big(r.paymasterPostOpGasLimit),
      isFinal: r.isFinal as boolean | undefined,
    }) as PaymasterFields;
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

  /** Optional status for pending/dropped UI (Pimlico). */
  getStatus = (hash: Hex) => this.request<{ status: string; transactionHash: Hex | null }>('pimlico_getUserOperationStatus', [hash]);
  getUserOperationByHash = (hash: Hex) => this.request<Record<string, unknown> | null>('eth_getUserOperationByHash', [hash]);

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
