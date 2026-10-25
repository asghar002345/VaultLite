import { useQuery } from '@tanstack/react-query';

import type { ChainKey } from '@/config/chains';
import type { TokenInfo } from '@/config/tokens';
import { evmBalances, isEvmChain } from '@/services/evm';
import { tronBalances } from '@/services/tron';
import { solanaDevnetBalance } from '@/crypto/solana';
import { useAllTokens } from '@/store/custom-tokens';
import { useSession } from '@/vault/session';

export interface TokenBalance extends TokenInfo {
  balance: bigint | null;
  error?: string;
}

async function chainBalances(all: TokenInfo[], chain: ChainKey, evm: `0x${string}`, tron: string, sol: string | null): Promise<TokenBalance[]> {
  const tokens = all.filter((t) => t.chain === chain);
  if (chain === 'solanaDevnet' && !sol) return [];
  try {
    const b = isEvmChain(chain)
      ? await evmBalances(chain, evm, tokens)
      : chain === 'solanaDevnet'
        ? { native: await solanaDevnetBalance(sol!) }
        : await tronBalances(tron, tokens);
    return tokens.map((t) => ({ ...t, balance: b[t.address] ?? 0n }));
  } catch (e) {
    // One flaky RPC must not blank the whole portfolio.
    return tokens.map((t) => ({ ...t, balance: null, error: (e as Error).message }));
  }
}

export function useBalances() {
  const { accounts } = useSession();
  const { tokens, ready } = useAllTokens();
  const keys = tokens.map((t) => `${t.chain}:${t.address}`).join(',');
  return useQuery({
    queryKey: ['balances', accounts?.evm.address, accounts?.tron.address, keys],
    enabled: !!accounts && ready,
    staleTime: 15_000,
    queryFn: async () => {
      const chains = [...new Set(tokens.map((t) => t.chain))];
      const lists = await Promise.all(chains.map((c) => chainBalances(tokens, c, accounts!.evm.address, accounts!.tron.address, accounts!.solana.address)));
      return lists.flat();
    },
  });
}
