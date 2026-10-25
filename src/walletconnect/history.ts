import { decodeFunctionData, erc20Abi, formatUnits, type Hex } from 'viem';

import type { ChainKey } from '@/config/chains';
import { NATIVE, type TokenInfo } from '@/config/tokens';
import type { TxRecord } from '@/store/history-core';

import { isUnlimited } from './decode';
import type { EvmTxParams } from './requests';

/** Build a history record for a dApp-initiated tx, decoding known ERC-20 calls into token amounts. */
export function dappTxRecord(
  chain: ChainKey,
  nativeSymbol: string,
  tx: EvmTxParams,
  hash: string,
  from: string,
  tokens: TokenInfo[],
  createdAt: number,
  dapp?: string,
): TxRecord {
  const base: TxRecord = {
    hash, chain, kind: 'send', from, to: tx.to ?? '', tokenAddress: NATIVE, symbol: nativeSymbol, decimals: 18,
    amount: BigInt(tx.value ?? '0').toString(), status: 'pending', createdAt, dapp,
  };
  if (!tx.data || tx.data === '0x') return base;
  const token = tokens.find((t) => t.chain === chain && t.address.toLowerCase() === (tx.to ?? '').toLowerCase());
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data: tx.data as Hex });
    const sym = token?.symbol ?? 'tokens';
    const dec = token?.decimals ?? 18;
    if (d.functionName === 'transfer') {
      const [to, amt] = d.args as [string, bigint];
      return token
        ? { ...base, to, tokenAddress: token.address, symbol: token.symbol, decimals: token.decimals, amount: amt.toString() }
        : { ...base, kind: 'contract', to, amount: '0', label: `Token transfer (unknown token ${short(tx.to)})` };
    }
    if (d.functionName === 'transferFrom') {
      const [, to, amt] = d.args as [string, string, bigint];
      return { ...base, kind: 'contract', to, amount: '0', label: `transferFrom ${token ? `${formatUnits(amt, dec)} ${sym}` : ''}`.trim() };
    }
    if (d.functionName === 'approve') {
      const [spender, amt] = d.args as [string, bigint];
      return { ...base, kind: 'contract', to: spender, amount: '0', label: `Approve ${isUnlimited(amt) ? 'UNLIMITED' : formatUnits(amt, dec)} ${sym}` };
    }
  } catch {
    /* not ERC-20 */
  }
  return { ...base, kind: 'contract', label: `Contract call ${tx.data.slice(0, 10)}` };
}

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '?');
