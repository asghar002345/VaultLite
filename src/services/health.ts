import { CHAINS, type ChainKey } from '@/config/chains';
import { isEvmChain, publicClient } from '@/services/evm';

export interface ChainHealth {
  chain: ChainKey;
  ok: boolean;
  height?: bigint;
  latencyMs?: number;
  error?: string;
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Live check of a chain's RPC: latest block/slot height and round-trip latency. */
export async function chainHealth(chain: ChainKey, now: () => number = Date.now): Promise<ChainHealth> {
  const t0 = now();
  try {
    let height: bigint;
    if (isEvmChain(chain)) height = await publicClient(chain).getBlockNumber();
    else if (chain === 'tronNile') {
      const j = await postJson(`${CHAINS.tronNile.rpcUrls[0]}/wallet/getnowblock`, {});
      height = BigInt(j.block_header.raw_data.number);
    } else {
      const j = await postJson(CHAINS.solanaDevnet.rpcUrls[0], { jsonrpc: '2.0', id: 1, method: 'getSlot' });
      if (j.error) throw new Error(j.error.message);
      height = BigInt(j.result);
    }
    return { chain, ok: true, height, latencyMs: now() - t0 };
  } catch (e) {
    return { chain, ok: false, latencyMs: now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
