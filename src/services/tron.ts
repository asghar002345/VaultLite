import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import { decodeFunctionResult, erc20Abi } from 'viem';

import { CHAINS } from '@/config/chains';
import { NATIVE, type TokenInfo } from '@/config/tokens';
import { tronFeeSun, tronTxBandwidth, type TronPrices, type TronResources } from '@/lib/fees';

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

// ---------- fee estimation ----------

let pricesCache: { at: number; v: TronPrices & { activationSun: number } } | null = null;

export async function tronPrices(): Promise<TronPrices & { activationSun: number }> {
  if (pricesCache && Date.now() - pricesCache.at < 10 * 60_000) return pricesCache.v;
  const r = await post<{ chainParameter: { key: string; value?: number }[] }>('/wallet/getchainparameters', {});
  const get = (k: string, d: number) => r.chainParameter.find((x) => x.key === k)?.value ?? d;
  const v = {
    sunPerBandwidth: get('getTransactionFee', 1000),
    sunPerEnergy: get('getEnergyFee', 420),
    // Creating (activating) a new account via a TRX transfer: system-contract fee + create-account bandwidth fee.
    activationSun: get('getCreateNewAccountFeeInSystemContract', 1_000_000) + get('getCreateAccountFee', 100_000),
  };
  pricesCache = { at: Date.now(), v };
  return v;
}

export async function tronResources(addr: string): Promise<TronResources> {
  const r = await post<{ freeNetLimit?: number; freeNetUsed?: number; NetLimit?: number; NetUsed?: number; EnergyLimit?: number; EnergyUsed?: number }>(
    '/wallet/getaccountresource',
    { address: addr, visible: true },
  );
  return {
    bandwidthLeft: Math.max(0, (r.freeNetLimit ?? 0) - (r.freeNetUsed ?? 0)) + Math.max(0, (r.NetLimit ?? 0) - (r.NetUsed ?? 0)),
    energyLeft: Math.max(0, (r.EnergyLimit ?? 0) - (r.EnergyUsed ?? 0)),
  };
}

async function accountExists(addr: string) {
  const a = await post<{ address?: string }>('/wallet/getaccount', { address: addr, visible: true });
  return !!a.address;
}

/** Simulate a TRC-20 transfer to get energy_used (no state change). */
export async function estimateTrc20Energy(from: string, to: string, token: TokenInfo, amount: bigint): Promise<number> {
  const r = await post<{ energy_used?: number; result?: { result?: boolean; message?: string } }>('/wallet/triggerconstantcontract', {
    owner_address: from,
    contract_address: token.address,
    function_selector: 'transfer(address,uint256)',
    parameter: tronAddressToAbiWord(to) + amount.toString(16).padStart(64, '0'),
    visible: true,
  });
  if (r.result && r.result.result === false) throw new Error(r.result.message ?? 'TRC-20 simulation failed');
  return r.energy_used ?? 0;
}

export async function estimateTronFee(from: string, to: string, token: TokenInfo, amount: bigint) {
  const [tx, res, prices, toExists, energy] = await Promise.all([
    buildTronTransfer(from, to, token, amount),
    tronResources(from),
    tronPrices(),
    token.address === NATIVE ? accountExists(to) : Promise.resolve(true),
    token.address === NATIVE ? Promise.resolve(0) : estimateTrc20Energy(from, to, token, amount),
  ]);
  return {
    ...tronFeeSun(tronTxBandwidth(tx.raw_data_hex.length), energy, res, prices, toExists ? 0 : prices.activationSun),
    resources: res,
    recipientActivated: toExists,
  };
}

// ---------- custom token verification ----------
async function constant(contract: string, selector: string): Promise<`0x${string}` | null> {
  const r = await post<{ constant_result?: string[]; result?: { result?: boolean } }>('/wallet/triggerconstantcontract', {
    owner_address: contract,
    contract_address: contract,
    function_selector: selector,
    visible: true,
  });
  const h = r.constant_result?.[0];
  return h && h.length >= 64 ? `0x${h}` : null;
}

export async function verifyTrc20(address: string): Promise<{ symbol: string; name: string; decimals: number }> {
  const [d, s, n] = await Promise.all([constant(address, 'decimals()'), constant(address, 'symbol()'), constant(address, 'name()')]);
  if (!d || !s) throw new Error('Not a TRC-20 token on Nile (decimals()/symbol() missing)');
  const decimals = Number(decodeFunctionResult({ abi: erc20Abi, functionName: 'decimals', data: d }));
  const symbol = decodeFunctionResult({ abi: erc20Abi, functionName: 'symbol', data: s });
  const name = n ? decodeFunctionResult({ abi: erc20Abi, functionName: 'name', data: n }) : symbol;
  return { symbol, name, decimals };
}
