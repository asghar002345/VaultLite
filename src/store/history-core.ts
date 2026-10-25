import type { ChainKey } from '@/config/chains';

export type TxStatus = 'pending' | 'success' | 'failed' | 'replaced';
export type TxKind = 'send' | 'speedup' | 'cancel' | 'contract';

export interface TxRecord {
  hash: string;
  chain: ChainKey;
  kind: TxKind;
  from: string;
  to: string;
  tokenAddress: string;
  symbol: string;
  decimals: number;
  /** base units, decimal string (bigint isn't JSON-serializable) */
  amount: string;
  status: TxStatus;
  createdAt: number;
  block?: string;
  error?: string;
  /** Human summary for contract calls (e.g. "Approve 5 USDC"). */
  label?: string;
  /** dApp name for WalletConnect-originated txs. */
  dapp?: string;
  // EVM replacement metadata
  nonce?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  replaces?: string;
  replacedBy?: string;
}

export const MAX_HISTORY = 200;

export function addTx(list: TxRecord[], rec: TxRecord): TxRecord[] {
  let next = [rec, ...list.filter((t) => t.hash !== rec.hash)];
  if (rec.replaces) next = next.map((t) => (t.hash === rec.replaces ? { ...t, replacedBy: rec.hash } : t));
  return next.slice(0, MAX_HISTORY);
}

/**
 * Apply a final status. When an EVM tx is mined, every other pending tx from the same
 * sender/chain/nonce (the original or its replacements) is marked 'replaced'.
 */
export function settleTx(list: TxRecord[], hash: string, status: TxStatus, block?: string): TxRecord[] {
  const me = list.find((t) => t.hash === hash);
  if (!me) return list;
  return list.map((t) => {
    if (t.hash === hash) return { ...t, status, block };
    if (
      (status === 'success' || status === 'failed') &&
      t.status === 'pending' &&
      me.nonce !== undefined &&
      t.nonce === me.nonce &&
      t.chain === me.chain &&
      t.from.toLowerCase() === me.from.toLowerCase()
    ) {
      return { ...t, status: 'replaced' as const, replacedBy: hash };
    }
    return t;
  });
}

export const pendingTxs = (list: TxRecord[]) => list.filter((t) => t.status === 'pending');

/** The newest pending tx in a replacement chain is the one worth speeding up / cancelling. */
export function canReplace(list: TxRecord[], t: TxRecord) {
  return t.status === 'pending' && t.nonce !== undefined && !t.replacedBy && !list.some((x) => x.replaces === t.hash && x.status === 'pending');
}
