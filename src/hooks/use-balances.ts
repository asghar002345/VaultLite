import { useQuery } from '@tanstack/react-query';

import type { ChainKey } from '@/config/chains';
import { TOKENS, type TokenInfo } from '@/config/tokens';
import { evmBalances, isEvmChain } from '@/services/evm';
import { tronBalances } from '@/services/tron';
import { useSession } from '@/vault/session';

export interface TokenBalance extends TokenInfo {
  balance: bigint | null;
  error?: string;
}

const CHAIN_KEYS = [...new Set(TOKENS.map((t) => t.chain))];

async function chainBalances(chain: ChainKey, evm: `0x${string}`, tron: string): Promise<TokenBalance[]> {
  const tokens = TOKENS.filter((t) => t.chain === chain);
  try {
    const b = isEvmChain(chain) ? await evmBalances(chain, evm, tokens) : await tronBalances(tron, tokens);
    return tokens.map((t) => ({ ...t, balance: b[t.address] ?? 0n }));
  } catch (e) {
    // One flaky RPC must not blank the whole portfolio.
    return tokens.map((t) => ({ ...t, balance: null, error: (e as Error).message }));
  }
}

export function useBalances() {
  const { accounts } = useSession();
  return useQuery({
    queryKey: ['balances', accounts?.evm.address, accounts?.tron.address],
    enabled: !!accounts,
    staleTime: 15_000,
    queryFn: async () => {
      const lists = await Promise.all(CHAIN_KEYS.map((c) => chainBalances(c, accounts!.evm.address, accounts!.tron.address)));
      return lists.flat();
    },
  });
}
