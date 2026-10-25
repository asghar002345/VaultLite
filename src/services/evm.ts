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

export async function sendEvmTx(r: EvmTxRequest, pk: `0x${string}`, gasLimit: bigint, fee: FeeQuote) {
  const account = privateKeyToAccount(pk);
  if (account.address.toLowerCase() !== r.from.toLowerCase()) throw new Error('Signer does not match sender');
  const wallet = createWalletClient({ account, chain: VIEM_CHAINS[r.chain], transport: transport(r.chain) });
  return wallet.sendTransaction({
    ...callFor(r),
    gas: gasLimit,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  });
}

export type TxState = { state: 'pending' } | { state: 'success'; block: bigint } | { state: 'failed'; block?: bigint; reason?: string };

export async function evmTxState(k: EvmChainKey, hash: `0x${string}`): Promise<TxState> {
  try {
    const r = await publicClient(k).getTransactionReceipt({ hash });
    return r.status === 'success' ? { state: 'success', block: r.blockNumber } : { state: 'failed', block: r.blockNumber };
  } catch {
    return { state: 'pending' };
  }
}

export const explorerTxUrl = (k: ChainKey, hash: string) =>
  k === 'tronNile' ? `${CHAINS[k].explorerUrl}/#/transaction/${hash.replace(/^0x/, '')}` : `${CHAINS[k].explorerUrl}/tx/${hash}`;
