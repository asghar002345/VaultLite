import type { ChainKey } from '@/config/chains';
import { tronHexToBase58 } from '@/crypto/tron-sign';

/**
 * Incoming transfers from KEYLESS explorer APIs only:
 *  - Sepolia, Base Sepolia: Blockscout REST v2 (no API key).
 *  - Tron Nile: TronGrid v1 account endpoints (no API key; rate-limited).
 * Polygon Amoy and BSC Testnet are skipped: their explorers (Polygonscan/BscScan/Etherscan v2) need a key.
 */
export interface IncomingTx {
  id: string;
  hash: string;
  chain: ChainKey;
  from: string;
  to: string;
  tokenAddress: string; // 'native' or contract
  symbol: string;
  decimals: number;
  amount: string;
  timestamp: number;
}

export const BLOCKSCOUT: Partial<Record<ChainKey, string>> = {
  sepolia: 'https://eth-sepolia.blockscout.com',
  baseSepolia: 'https://base-sepolia.blockscout.com',
};
export const INCOMING_CHAINS: ChainKey[] = ['sepolia', 'baseSepolia', 'tronNile'];
const TRONGRID = 'https://nile.trongrid.io';

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Explorer HTTP ${r.status}`);
  return (await r.json()) as T;
}

type BsAddr = { hash: string };
type BsTx = { hash: string; timestamp: string; value: string; result?: string; from: BsAddr; to: BsAddr | null };
type BsTransfer = {
  transaction_hash: string; log_index: number; timestamp: string; from: BsAddr; to: BsAddr;
  total: { value: string; decimals: string | null }; token: { address_hash: string; symbol: string | null; decimals: string | null };
};

export function mapBlockscout(chain: ChainKey, owner: string, txs: BsTx[], transfers: BsTransfer[]): IncomingTx[] {
  const me = owner.toLowerCase();
  const native = txs
    .filter((t) => t.to?.hash.toLowerCase() === me && t.from.hash.toLowerCase() !== me && BigInt(t.value) > 0n && t.result !== 'error')
    .map((t) => ({
      id: `${chain}:${t.hash}:native`, hash: t.hash, chain, from: t.from.hash, to: t.to!.hash,
      tokenAddress: 'native', symbol: 'ETH', decimals: 18, amount: t.value, timestamp: Date.parse(t.timestamp),
    }));
  const tokens = transfers
    .filter((t) => t.to.hash.toLowerCase() === me && t.from.hash.toLowerCase() !== me)
    .map((t) => {
      const dec = Number(t.token.decimals ?? t.total.decimals ?? 18);
      return {
        id: `${chain}:${t.transaction_hash}:${t.log_index}`, hash: t.transaction_hash, chain, from: t.from.hash, to: t.to.hash,
        tokenAddress: t.token.address_hash, symbol: t.token.symbol ?? '???', decimals: dec, amount: t.total.value,
        timestamp: Date.parse(t.timestamp),
      };
    });
  return [...native, ...tokens];
}

type TgTrc20 = { transaction_id: string; token_info: { symbol: string; address: string; decimals: number }; block_timestamp: number; from: string; to: string; value: string; type: string };
type TgTx = {
  txID: string; block_timestamp: number; ret?: { contractRet?: string }[];
  raw_data: { contract: { type: string; parameter: { value: { amount?: number; owner_address?: string; to_address?: string } } }[] };
};

export function mapTronGrid(owner: string, txs: TgTx[], trc20: TgTrc20[]): IncomingTx[] {
  const native = txs.flatMap((t) => {
    const c = t.raw_data.contract[0];
    const v = c?.parameter.value;
    if (c?.type !== 'TransferContract' || !v?.to_address || !v.owner_address || t.ret?.[0]?.contractRet !== 'SUCCESS') return [];
    const to = tronHexToBase58(v.to_address);
    if (to !== owner) return [];
    return [{
      id: `tronNile:${t.txID}:native`, hash: t.txID, chain: 'tronNile' as const, from: tronHexToBase58(v.owner_address), to,
      tokenAddress: 'native', symbol: 'TRX', decimals: 6, amount: String(v.amount ?? 0), timestamp: t.block_timestamp,
    }];
  });
  const tokens = trc20
    .filter((t) => t.to === owner && t.type === 'Transfer' && t.from !== owner)
    .map((t) => ({
      id: `tronNile:${t.transaction_id}:${t.token_info.address}`, hash: t.transaction_id, chain: 'tronNile' as const, from: t.from, to: t.to,
      tokenAddress: t.token_info.address, symbol: t.token_info.symbol, decimals: t.token_info.decimals, amount: t.value, timestamp: t.block_timestamp,
    }));
  return [...native, ...tokens];
}

export async function fetchIncoming(evm: string, tron: string): Promise<{ items: IncomingTx[]; errors: string[] }> {
  const errors: string[] = [];
  const jobs: Promise<IncomingTx[]>[] = [
    ...(Object.entries(BLOCKSCOUT) as [ChainKey, string][]).map(async ([chain, base]) => {
      try {
        const [txs, tr] = await Promise.all([
          getJson<{ items: BsTx[] }>(`${base}/api/v2/addresses/${evm}/transactions?filter=to`),
          getJson<{ items: BsTransfer[] }>(`${base}/api/v2/addresses/${evm}/token-transfers?type=ERC-20&filter=to`),
        ]);
        return mapBlockscout(chain, evm, txs.items ?? [], tr.items ?? []);
      } catch (e) {
        errors.push(`${chain}: ${(e as Error).message}`);
        return [];
      }
    }),
    (async () => {
      try {
        const [txs, tr] = await Promise.all([
          getJson<{ data: TgTx[] }>(`${TRONGRID}/v1/accounts/${tron}/transactions?only_to=true&limit=50`),
          getJson<{ data: TgTrc20[] }>(`${TRONGRID}/v1/accounts/${tron}/transactions/trc20?only_to=true&limit=50`),
        ]);
        return mapTronGrid(tron, txs.data ?? [], tr.data ?? []);
      } catch (e) {
        errors.push(`tronNile: ${(e as Error).message}`);
        return [];
      }
    })(),
  ];
  const items = (await Promise.all(jobs)).flat().sort((a, b) => b.timestamp - a.timestamp);
  return { items, errors };
}
