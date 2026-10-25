import { CHAIN_LIST } from '@/config/chains';

import { validateAddress } from './address';

export type ScanResult =
  | { kind: 'wc'; uri: string }
  | { kind: 'address'; family: 'evm' | 'tron'; address: string; chainId?: number; chainKey?: string; amount?: string }
  | { kind: 'unknown'; reason: string };

/**
 * Parse a scanned QR payload: WalletConnect v2 URI, EIP-681 `ethereum:` URI,
 * `tron:` URI, or a bare EVM / Tron address. Mainnet chain ids are rejected.
 */
export function parseScan(raw: string): ScanResult {
  const data = raw.trim();
  if (/^wc:[0-9a-f]+@2\?/i.test(data)) {
    return /[?&]symKey=/.test(data) && /[?&]relay-protocol=/.test(data)
      ? { kind: 'wc', uri: data }
      : { kind: 'unknown', reason: 'Incomplete WalletConnect URI' };
  }
  if (data.startsWith('wc:')) return { kind: 'unknown', reason: 'Unsupported WalletConnect version (v2 only)' };

  // EIP-681: ethereum:[pay-]<address>[@chainId][/function][?params]
  const eth = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(\/[a-zA-Z]+)?(?:\?(.*))?$/.exec(data);
  if (eth) {
    const [, addr, chainIdStr, fn, query] = eth;
    if (fn) return { kind: 'unknown', reason: 'Payment-request functions (e.g. /transfer) are not supported yet' };
    const v = validateAddress('evm', addr);
    if (!v.ok) return { kind: 'unknown', reason: v.reason };
    let chainKey: string | undefined;
    let chainId: number | undefined;
    if (chainIdStr) {
      chainId = Number(chainIdStr);
      const c = CHAIN_LIST.find((x) => x.chainId === chainId);
      if (!c) return { kind: 'unknown', reason: `Chain ${chainId} is not a supported testnet` };
      chainKey = c.key;
    }
    const value = query ? new URLSearchParams(query).get('value') ?? undefined : undefined;
    return { kind: 'address', family: 'evm', address: v.normalized, chainId, chainKey, amount: value };
  }

  const tron = /^tron:(T[1-9A-HJ-NP-Za-km-z]{33})(?:\?(.*))?$/.exec(data);
  const bare = tron ? tron[1] : data;
  const amount = tron?.[2] ? new URLSearchParams(tron[2]).get('amount') ?? undefined : undefined;
  if (/^T/.test(bare)) {
    const v = validateAddress('tron', bare);
    return v.ok ? { kind: 'address', family: 'tron', address: v.normalized, chainKey: 'tronNile', amount } : { kind: 'unknown', reason: v.reason };
  }
  if (/^0x/i.test(bare)) {
    const v = validateAddress('evm', bare);
    return v.ok ? { kind: 'address', family: 'evm', address: v.normalized } : { kind: 'unknown', reason: v.reason };
  }
  return { kind: 'unknown', reason: 'Not an address or WalletConnect code' };
}
