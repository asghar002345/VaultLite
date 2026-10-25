import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

import { CHAINS } from '@/config/chains';
import { NATIVE, type TokenInfo } from '@/config/tokens';

import type { TxState } from './evm';

const API = CHAINS.tronNile.rpcUrls[0];
/** Max TRX (in sun) a TRC-20 transfer may burn for energy. 100 TRX. */
export const TRC20_FEE_LIMIT = 100_000_000;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`TronGrid ${path} HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** ABI-encode a Tron base58 address as a 32-byte word (drop 0x41 prefix). */
export function tronAddressToAbiWord(addr: string): string {
  const raw = base58.decode(addr).slice(1, 21);
  return bytesToHex(raw).padStart(64, '0');
}

export async function tronBalances(owner: string, tokens: TokenInfo[]): Promise<Record<string, bigint>> {
  const out: Record<string, bigint> = {};
  const acct = await post<{ balance?: number }>('/wallet/getaccount', { address: owner, visible: true });
  out[NATIVE] = BigInt(acct.balance ?? 0);
  await Promise.all(
    tokens
      .filter((t) => t.address !== NATIVE)
      .map(async (t) => {
        const r = await post<{ constant_result?: string[] }>('/wallet/triggerconstantcontract', {
          owner_address: owner,
          contract_address: t.address,
          function_selector: 'balanceOf(address)',
          parameter: tronAddressToAbiWord(owner),
          visible: true,
        });
        const hex = r.constant_result?.[0];
        out[t.address] = hex ? BigInt(`0x${hex}`) : 0n;
      }),
  );
  return out;
}

interface TronTx {
  txID: string;
  raw_data: unknown;
  raw_data_hex: string;
  signature?: string[];
  visible?: boolean;
}

export async function buildTronTransfer(from: string, to: string, token: TokenInfo, amount: bigint): Promise<TronTx> {
  if (token.address === NATIVE) {
    const tx = await post<TronTx & { Error?: string }>('/wallet/createtransaction', {
      owner_address: from,
      to_address: to,
      amount: Number(amount),
      visible: true,
    });
    if (!tx.txID) throw new Error(tx.Error ?? 'createtransaction failed');
    return tx;
  }
  const r = await post<{ transaction?: TronTx; result?: { result?: boolean; message?: string } }>(
    '/wallet/triggersmartcontract',
    {
      owner_address: from,
      contract_address: token.address,
      function_selector: 'transfer(address,uint256)',
      parameter: tronAddressToAbiWord(to) + amount.toString(16).padStart(64, '0'),
      fee_limit: TRC20_FEE_LIMIT,
      call_value: 0,
      visible: true,
    },
  );
  if (!r.transaction?.txID) throw new Error(r.result?.message ?? 'triggersmartcontract failed');
  return r.transaction;
}

/** Tron signature = r ‖ s ‖ (recovery + 27) over the txID (sha256 of raw_data). */
export function signTronTx(tx: TronTx, pk: `0x${string}`): TronTx {
  const sig = secp256k1.sign(hexToBytes(tx.txID), hexToBytes(pk.slice(2)), { prehash: false, format: 'recovered' });
  const rs = bytesToHex(sig.slice(1));
  const v = (sig[0] + 27).toString(16);
  return { ...tx, signature: [rs + v] };
}

export async function broadcastTron(tx: TronTx): Promise<string> {
  const r = await post<{ result?: boolean; txid?: string; message?: string; code?: string }>('/wallet/broadcasttransaction', tx);
  if (!r.result) throw new Error(r.code ?? r.message ?? 'broadcast failed');
  return r.txid ?? tx.txID;
}

export async function tronTxState(txid: string): Promise<TxState> {
  const r = await post<{ id?: string; blockNumber?: number; receipt?: { result?: string }; result?: string }>(
    '/wallet/gettransactioninfobyid',
    { value: txid },
  );
  if (!r.id || r.blockNumber === undefined) return { state: 'pending' };
  const failed = r.result === 'FAILED' || (r.receipt?.result && r.receipt.result !== 'SUCCESS');
  return failed
    ? { state: 'failed', block: BigInt(r.blockNumber), reason: r.receipt?.result ?? r.result }
    : { state: 'success', block: BigInt(r.blockNumber) };
}
