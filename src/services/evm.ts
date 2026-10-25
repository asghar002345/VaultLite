import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  fallback,
  http,
  type Chain,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, bscTestnet, polygonAmoy, sepolia } from 'viem/chains';

import { CHAINS, type ChainKey } from '@/config/chains';
import { NATIVE, type TokenInfo } from '@/config/tokens';
import { feeTiers, padGas, type FeeQuote, type FeeTier } from '@/lib/fees';

export type EvmChainKey = 'sepolia' | 'polygonAmoy' | 'bscTestnet' | 'baseSepolia';
export const VIEM_CHAINS: Record<EvmChainKey, Chain> = { sepolia, polygonAmoy, bscTestnet, baseSepolia };
export const isEvmChain = (k: string): k is EvmChainKey => k in VIEM_CHAINS;

const clients: Partial<Record<EvmChainKey, PublicClient>> = {};
const transport = (k: EvmChainKey) => fallback(CHAINS[k].rpcUrls.map((u) => http(u, { timeout: 10_000 })));

export function publicClient(k: EvmChainKey): PublicClient {
  if (!clients[k]) clients[k] = createPublicClient({ chain: VIEM_CHAINS[k], transport: transport(k) }) as PublicClient;
  return clients[k]!;
}

/** Native + ERC-20 balances for one chain (ERC-20s via multicall where available). */
export async function evmBalances(k: EvmChainKey, owner: `0x${string}`, tokens: TokenInfo[]): Promise<Record<string, bigint>> {
  const c = publicClient(k);
  const erc20 = tokens.filter((t) => t.address !== NATIVE);
  const [native, ...rest] = await Promise.all([
    c.getBalance({ address: owner }),
    ...erc20.map((t) =>
      c.readContract({ address: t.address as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    ),
  ]);
  const out: Record<string, bigint> = { [NATIVE]: native };
  erc20.forEach((t, i) => (out[t.address] = rest[i] as bigint));
  return out;
}

export interface EvmTxRequest {
  chain: EvmChainKey;
  from: `0x${string}`;
  to: `0x${string}`;
  token: TokenInfo;
  amount: bigint;
}

function callFor(r: EvmTxRequest): { to: `0x${string}`; value: bigint; data?: `0x${string}` } {
  if (r.token.address === NATIVE) return { to: r.to, value: r.amount };
  return {
    to: r.token.address as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [r.to, r.amount] }),
  };
}

export interface EvmQuote {
  gasLimit: bigint;
  baseFeePerGas: bigint;
  tiers: Record<FeeTier, FeeQuote>;
}

export async function quoteEvmTx(r: EvmTxRequest): Promise<EvmQuote> {
  const c = publicClient(r.chain);
  const call = callFor(r);
  const [block, tip, gas] = await Promise.all([
    c.getBlock({ blockTag: 'latest' }),
    c.estimateMaxPriorityFeePerGas().catch(() => 1_000_000_000n),
    c.estimateGas({ account: r.from, ...call }),
  ]);
  const base = block.baseFeePerGas ?? (await c.getGasPrice());
  return { gasLimit: padGas(gas), baseFeePerGas: base, tiers: feeTiers(base, tip) };
}

function walletFor(k: EvmChainKey, pk: `0x${string}`, from: string) {
  const account = privateKeyToAccount(pk);
  if (account.address.toLowerCase() !== from.toLowerCase()) throw new Error('Signer does not match sender');
  return createWalletClient({ account, chain: VIEM_CHAINS[k], transport: transport(k) });
}

/** Sends with an explicit pending nonce so the tx can later be sped up / cancelled. */
export async function sendEvmTx(r: EvmTxRequest, pk: `0x${string}`, gasLimit: bigint, fee: FeeQuote) {
  const wallet = walletFor(r.chain, pk, r.from);
  const nonce = await publicClient(r.chain).getTransactionCount({ address: r.from, blockTag: 'pending' });
  const hash = await wallet.sendTransaction({
    ...callFor(r),
    nonce,
    gas: gasLimit,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
  return { hash, nonce };
}

export interface ReplaceArgs {
  chain: EvmChainKey;
  from: `0x${string}`;
  nonce: number;
  /** Original call (speed-up) — ignored for cancel. */
  call: { to: `0x${string}`; value: bigint; data?: `0x${string}` };
  gasLimit: bigint;
  fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
}

/** Speed-up = same call, same nonce, higher fees. Cancel = 0-value self-transfer, same nonce. */
export async function replaceEvmTx(mode: 'speedup' | 'cancel', a: ReplaceArgs, pk: `0x${string}`) {
  const wallet = walletFor(a.chain, pk, a.from);
  const call = mode === 'cancel' ? { to: a.from, value: 0n } : a.call;
  return wallet.sendTransaction({
    ...call,
    nonce: a.nonce,
    gas: mode === 'cancel' ? 21_000n : a.gasLimit,
    maxFeePerGas: a.fees.maxFeePerGas,
    maxPriorityFeePerGas: a.fees.maxPriorityFeePerGas,
  });
}

/** Current market fee for the 'normal' tier (used as replacement floor). */
export async function marketFee(k: EvmChainKey) {
  const c = publicClient(k);
  const [block, tip] = await Promise.all([c.getBlock({ blockTag: 'latest' }), c.estimateMaxPriorityFeePerGas().catch(() => 1_000_000_000n)]);
  return feeTiers(block.baseFeePerGas ?? (await c.getGasPrice()), tip).normal;
}

export { callFor };

/** On-chain check that an address is an ERC-20: code exists and decimals()/symbol() succeed. */
export async function verifyErc20(k: EvmChainKey, address: `0x${string}`) {
  const c = publicClient(k);
  const code = await c.getCode({ address });
  if (!code || code === '0x') throw new Error('No contract at this address on ' + VIEM_CHAINS[k].name);
  const [decimals, symbol, name] = await Promise.all([
    c.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    c.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    c.readContract({ address, abi: erc20Abi, functionName: 'name' }).catch(() => ''),
  ]);
  if (decimals > 36) throw new Error('Unreasonable decimals()');
  return { decimals: Number(decimals), symbol, name: name || symbol };
}

export type TxState = { state: 'pending' } | { state: 'replaced' } | { state: 'success'; block: bigint } | { state: 'failed'; block?: bigint; reason?: string };

/** If `from`/`nonce` are known, a missing receipt with a consumed nonce means it was replaced/dropped. */
export async function evmTxState(k: EvmChainKey, hash: `0x${string}`, from?: `0x${string}`, nonce?: number): Promise<TxState> {
  const c = publicClient(k);
  try {
    const r = await c.getTransactionReceipt({ hash });
    return r.status === 'success' ? { state: 'success', block: r.blockNumber } : { state: 'failed', block: r.blockNumber };
  } catch {
    if (from && nonce !== undefined) {
      const mined = await c.getTransactionCount({ address: from, blockTag: 'latest' }).catch(() => -1);
      if (mined > nonce) return { state: 'replaced' };
    }
    return { state: 'pending' };
  }
}

export const explorerTxUrl = (k: ChainKey, hash: string) =>
  k === 'tronNile' ? `${CHAINS[k].explorerUrl}/#/transaction/${hash.replace(/^0x/, '')}` : `${CHAINS[k].explorerUrl}/tx/${hash}`;
