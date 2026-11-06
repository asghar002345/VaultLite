/**
 * Batched calls for one ERC-4337 UserOp.
 *
 * The account's executeBatch is ERC-7579 `execute(MODE_BATCH, abi.encode(Execution[]))`.
 * There is no paymaster policy for an arbitrary batch (approve + contract call, etc.):
 * the bundler proxy answers `pm_*` with 403 / -32002 `not_sponsorable`. Batches are
 * therefore sent self-paid through the existing bundler proxy client.
 */
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  maxUint256,
  parseUnits,
  type Hex,
} from 'viem';

import { findToken } from '@/config/tokens';
import { formatAmount } from '@/lib/format';
import { isUnlimited } from '@/walletconnect/decode';

import { smartAccountAbi } from './abis';
import { MODE_BATCH, MODE_SINGLE } from './encoding';
import type { Call } from './types';
import type { BuildOptions, VaultLiteSmartAccountProvider } from './VaultLiteSmartAccountProvider';

/** Self-paid batch. Do not ask the proxy to sponsor — it will return not_sponsorable. */
export const BATCH_BUILD_OPTS: BuildOptions = { sponsor: false, batch: true };

const EXECUTION_ARRAY = [
  { type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }] },
] as const;

export interface DecodedApproval {
  token: Hex;
  spender: Hex;
  amount: bigint;
  unlimited: boolean;
  /** "Unlimited", a formatted "5 USDC", or the raw integer when the token is unknown. */
  amountLabel: string;
  symbol: string | null;
}

export interface ReviewedCall {
  index: number;
  to: Hex;
  value: bigint;
  title: string;
  /** Contract call detail (function and args) when this row is not an approval. */
  detail: string;
  approval: DecodedApproval | null;
  warning: string | null;
}

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

const APPROVE = '0x095ea7b3';

export function tokenMeta(token: Hex): TokenMeta | null {
  const t = findToken('baseSepolia', token);
  return t ? { symbol: t.symbol, decimals: t.decimals } : null;
}

/** ERC-20 `approve(spender, amount)` as one call in a batch. */
export function approvalCall(token: Hex, spender: Hex, amount: bigint): Call {
  if (!isAddress(token) || !isAddress(spender)) throw new Error('Token and spender must be addresses');
  return {
    to: getAddress(token),
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [getAddress(spender), amount] }),
  };
}

/** Decimal amount for an approval. `unlimited` is max uint256. Zero is allowed (revoke). */
export function parseApprovalAmount(input: string, decimals: number, unlimited: boolean): bigint | null {
  if (unlimited) return maxUint256;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const v = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  if ((v.split('.')[1]?.length ?? 0) > decimals) return null;
  return parseUnits(v, decimals);
}

export function parseCalldata(input: string): Hex | null {
  const v = (input.trim() || '0x').toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(v) || v.length % 2 !== 0) return null;
  return v as Hex;
}

export function parseWei(input: string): bigint | null {
  const v = input.trim() || '0';
  if (!/^\d+$/.test(v)) return null;
  return BigInt(v);
}

export function decodeTokenApproval(call: Call, meta?: TokenMeta | null): DecodedApproval | null {
  const data = call.data;
  if (!data || data === '0x' || !data.toLowerCase().startsWith(APPROVE)) return null;
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data });
    if (d.functionName !== 'approve' || !d.args) return null;
    const spender = getAddress(d.args[0]);
    const amount = d.args[1];
    const unlimited = isUnlimited(amount);
    const known = meta === undefined ? tokenMeta(call.to) : meta;
    const amountLabel = unlimited ? 'Unlimited' : known ? `${formatAmount(amount, known.decimals)} ${known.symbol}` : amount.toString();
    return { token: getAddress(call.to), spender, amount, unlimited, amountLabel, symbol: known?.symbol ?? null };
  } catch {
    return null;
  }
}

export function approvalWarning(a: DecodedApproval): string | null {
  if (!a.unlimited) return null;
  return `Unlimited approval: ${a.spender} could move all of this token, now and later.`;
}

function callDetail(data: Hex | undefined): { title: string; detail: string } {
  if (!data || data === '0x') return { title: 'Native transfer', detail: 'No calldata' };
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data });
    const args = (d.args ?? []).map((v) => (typeof v === 'bigint' ? v.toString() : String(v))).join(', ');
    return { title: d.functionName, detail: args || 'No arguments' };
  } catch {
    const selector = data.slice(0, 10);
    return { title: 'Contract call', detail: `Selector ${selector}` };
  }
}

/** One row per call, with ERC-20 approvals decoded to spender + amount. */
export function reviewBatch(calls: Call[], metaFor: (token: Hex) => TokenMeta | null = tokenMeta): ReviewedCall[] {
  return calls.map((c, index) => {
    const to = getAddress(c.to);
    const approval = decodeTokenApproval(c, metaFor(c.to));
    if (approval) {
      return {
        index,
        to,
        value: c.value ?? 0n,
        title: approval.symbol ? `Approve ${approval.symbol}` : 'Token approval',
        detail: approval.amountLabel,
        approval,
        warning: approvalWarning(approval),
      };
    }
    const decoded = callDetail(c.data);
    return { index, to, value: c.value ?? 0n, title: decoded.title, detail: decoded.detail, approval: null, warning: null };
  });
}

/** Inverse of encodeExecute / encodeExecuteBatch, for review and tests. */
export function decodeExecuteCalls(data: Hex): { mode: 'single' | 'batch'; calls: Call[] } {
  const d = decodeFunctionData({ abi: smartAccountAbi, data });
  if (d.functionName !== 'execute' || !d.args) throw new Error('Not an account execute');
  const mode = (d.args[0] as Hex).toLowerCase();
  const exec = d.args[1] as Hex;
  if (mode === MODE_BATCH.toLowerCase()) {
    const [rows] = decodeAbiParameters(EXECUTION_ARRAY, exec);
    return {
      mode: 'batch',
      calls: rows.map((r) => ({ to: getAddress(r.target), value: r.value, data: r.callData })),
    };
  }
  if (mode === MODE_SINGLE.toLowerCase()) {
    if (exec.length < 2 + 2 * 52) throw new Error('Single execution is shorter than 52 bytes');
    const to = getAddress(`0x${exec.slice(2, 42)}`);
    const value = BigInt(`0x${exec.slice(42, 106)}`);
    const callData = (`0x${exec.slice(106)}` || '0x') as Hex;
    return { mode: 'single', calls: [{ to, value, data: callData }] };
  }
  throw new Error('Unknown execution mode');
}

/** Build, sign and submit one self-paid batch UserOp via the provider's bundler proxy client. */
export async function sendBatchUserOperation(provider: VaultLiteSmartAccountProvider, calls: Call[]): Promise<{ userOpHash: Hex }> {
  if (calls.length === 0) throw new Error('No calls');
  return provider.sendUserOperation(calls, undefined, BATCH_BUILD_OPTS);
}
