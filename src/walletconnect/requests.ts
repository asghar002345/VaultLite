import { CHAIN_LIST, type ChainConfig } from '@/config/chains';
import { normalizeTronAddress, summarizeTronTx, tronTxIdMatches, type TronTxLike, type TronTxSummary } from '@/crypto/tron-sign';

import { decodeCalldata, decodePersonalMessage, parseTypedData, typedDataChainId, typedDataRisks, type DecodedCall, type Risk, type TypedData } from './decode';
import { RPC_ERRORS, rpcError, type RpcError } from './errors';
import { EVM_METHODS, TRON_METHODS } from './namespaces';

export interface EvmTxParams {
  from: string;
  to?: string;
  value?: string;
  data?: `0x${string}`;
  gas?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  nonce?: string;
  chainId?: string | number;
}

export type Analysis =
  | { kind: 'personal_sign'; chain: ChainConfig; message: string; display: { text: string; isHex: boolean }; risks: Risk[] }
  | { kind: 'typed_data'; chain: ChainConfig; typedData: TypedData; risks: Risk[] }
  | { kind: 'send_tx'; chain: ChainConfig; tx: EvmTxParams; decoded: DecodedCall; risks: Risk[] }
  | { kind: 'switch_chain'; chain: ChainConfig; target: ChainConfig; risks: Risk[] }
  | { kind: 'tron_sign_message'; chain: ChainConfig; message: string; risks: Risk[] }
  | { kind: 'tron_sign_tx'; chain: ChainConfig; tx: TronTxLike; legacy: boolean; summary: TronTxSummary; decoded: DecodedCall | null; risks: Risk[] }
  | { kind: 'error'; error: RpcError };

export interface RequestInput {
  method: string;
  params: unknown;
  chainId: string; // CAIP-2
  /** chains approved in this session for the namespace of chainId */
  sessionChains: string[];
  evmAddress: string;
  tronAddress: string;
  verify?: { validation?: 'VALID' | 'INVALID' | 'UNKNOWN' | string; isScam?: boolean; origin?: string };
}

const fail = (e: RpcError, d?: string): Analysis => ({ kind: 'error', error: rpcError(e, d) });
const eq = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const toNum = (v: string | number) => (typeof v === 'number' ? v : Number(v.startsWith('0x') ? BigInt(v) : v));

export function verifyRisks(v: RequestInput['verify']): Risk[] {
  if (!v) return [{ level: 'warning', text: 'Domain could not be verified.' }];
  if (v.isScam) return [{ level: 'danger', text: `Known scam domain${v.origin ? `: ${v.origin}` : ''}. Reject this request.` }];
  if (v.validation === 'INVALID') return [{ level: 'danger', text: `Domain mismatch: request comes from ${v.origin ?? 'an unexpected origin'}, not the dApp's registered domain.` }];
  if (v.validation === 'UNKNOWN') return [{ level: 'warning', text: 'Unverified domain (not registered with Reown Verify).' }];
  return [];
}

export function analyzeRequest(i: RequestInput): Analysis {
  const all = [...EVM_METHODS, ...TRON_METHODS] as string[];
  if (!all.includes(i.method)) return fail(RPC_ERRORS.unsupportedMethod, i.method);
  const chain = CHAIN_LIST.find((c) => c.caip2 === i.chainId);
  if (!chain) return fail(RPC_ERRORS.unrecognizedChain, i.chainId);
  if (!i.sessionChains.includes(i.chainId)) return fail(RPC_ERRORS.chainNotApproved, i.chainId);
  const vr = verifyRisks(i.verify);
  const p = i.params as unknown[];

  switch (i.method) {
    case 'personal_sign': {
      if (!Array.isArray(p) || p.length < 2) return fail(RPC_ERRORS.invalidParams);
      // Some dApps send [address, message]; accept either order.
      let [msg, addr] = p as [string, string];
      if (eq(msg, i.evmAddress) && !eq(addr, i.evmAddress)) [msg, addr] = [addr, msg];
      if (!eq(addr, i.evmAddress)) return fail(RPC_ERRORS.unauthorized, 'Address is not this wallet.');
      return { kind: 'personal_sign', chain, message: msg, display: decodePersonalMessage(msg), risks: vr };
    }
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      if (!Array.isArray(p) || p.length < 2) return fail(RPC_ERRORS.invalidParams);
      const [addr, raw] = p as [string, unknown];
      if (!eq(addr, i.evmAddress)) return fail(RPC_ERRORS.unauthorized, 'Address is not this wallet.');
      let td: TypedData;
      try {
        td = parseTypedData(raw);
      } catch {
        return fail(RPC_ERRORS.invalidParams, 'Malformed typed data.');
      }
      const tdChain = typedDataChainId(td);
      if (tdChain !== null && tdChain !== chain.chainId) {
        return fail(RPC_ERRORS.invalidParams, `chainId mismatch: typed data is for ${tdChain}, request is for ${chain.chainId}.`);
      }
      return { kind: 'typed_data', chain, typedData: td, risks: [...vr, ...typedDataRisks(td)] };
    }
    case 'eth_sendTransaction': {
      const tx = (Array.isArray(p) ? p[0] : undefined) as EvmTxParams | undefined;
      if (!tx || typeof tx !== 'object') return fail(RPC_ERRORS.invalidParams);
      if (!eq(tx.from, i.evmAddress)) return fail(RPC_ERRORS.unauthorized, 'from is not this wallet.');
      if (tx.chainId !== undefined && toNum(tx.chainId) !== chain.chainId) {
        return fail(RPC_ERRORS.invalidParams, `chainId mismatch: tx is for ${toNum(tx.chainId)}, request is for ${chain.chainId}.`);
      }
      if (!tx.to && tx.data) return fail(RPC_ERRORS.unsupportedMethod, 'Contract deployment is not supported.');
      const decoded = decodeCalldata(tx.data);
      const risks = [...vr, ...decoded.risks];
      if (tx.value && BigInt(tx.value) > 0n && tx.data && tx.data !== '0x') {
        risks.push({ level: 'warning', text: 'Sends native funds to a contract call.' });
      }
      return { kind: 'send_tx', chain, tx, decoded, risks };
    }
    case 'wallet_switchEthereumChain': {
      const want = (Array.isArray(p) ? (p[0] as { chainId?: string }) : undefined)?.chainId;
      if (!want) return fail(RPC_ERRORS.invalidParams);
      const target = CHAIN_LIST.find((c) => c.family === 'evm' && c.chainId === toNum(want));
      if (!target) return fail(RPC_ERRORS.unrecognizedChain, `chainId ${want}`);
      if (!i.sessionChains.includes(target.caip2)) return fail(RPC_ERRORS.chainNotApproved, target.caip2);
      return { kind: 'switch_chain', chain, target, risks: [] };
    }
    case 'tron_signMessage': {
      const { address, message } = (i.params ?? {}) as { address?: string; message?: string };
      if (typeof message !== 'string') return fail(RPC_ERRORS.invalidParams);
      if (!eq(address, i.tronAddress)) return fail(RPC_ERRORS.unauthorized, 'Address is not this wallet.');
      return { kind: 'tron_sign_message', chain, message, risks: vr };
    }
    case 'tron_signTransaction': {
      const { address, transaction } = (i.params ?? {}) as { address?: string; transaction?: Record<string, unknown> };
      if (!transaction) return fail(RPC_ERRORS.invalidParams);
      if (!eq(address, i.tronAddress)) return fail(RPC_ERRORS.unauthorized, 'Address is not this wallet.');
      const legacy = !!transaction.transaction && !transaction.txID;
      const tx = (legacy ? transaction.transaction : transaction) as TronTxLike;
      if (!tx?.txID || !tx.raw_data_hex || !tx.raw_data) return fail(RPC_ERRORS.invalidParams, 'Missing txID/raw_data.');
      if (!tronTxIdMatches(tx)) return fail(RPC_ERRORS.invalidParams, 'txID does not match raw_data_hex.');
      const summary = summarizeTronTx(tx);
      if (summary.owner && normalizeTronAddress(summary.owner) !== i.tronAddress) {
        return fail(RPC_ERRORS.unauthorized, 'Transaction owner is not this wallet.');
      }
      const decoded = summary.data ? decodeCalldata(summary.data) : null;
      const risks = [...vr, ...(decoded?.risks ?? [])];
      if (summary.type !== 'TransferContract' && summary.type !== 'TriggerSmartContract') {
        risks.push({ level: 'warning', text: `Uncommon Tron contract type: ${summary.type}.` });
      }
      return { kind: 'tron_sign_tx', chain, tx, legacy, summary, decoded, risks };
    }
  }
  return fail(RPC_ERRORS.unsupportedMethod, i.method);
}
