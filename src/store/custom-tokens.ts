import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { TOKENS, type TokenInfo } from '@/config/tokens';

const KEY = 'vaultlite.customTokens.v1';
const QK = ['customTokens'];

export async function loadCustomTokens(): Promise<TokenInfo[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export function mergeTokens(base: TokenInfo[], custom: TokenInfo[]): TokenInfo[] {
  const seen = new Set(base.map((t) => `${t.chain}:${t.address.toLowerCase()}`));
  return [...base, ...custom.filter((t) => !seen.has(`${t.chain}:${t.address.toLowerCase()}`))];
}

export function useAllTokens() {
  const q = useQuery({ queryKey: QK, queryFn: loadCustomTokens, staleTime: Infinity });
  return { tokens: mergeTokens(TOKENS, q.data ?? []), custom: q.data ?? [], ready: !q.isPending };
}

export function useCustomTokenMutations() {
  const qc = useQueryClient();
  const save = async (list: TokenInfo[]) => {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
    await qc.invalidateQueries({ queryKey: QK });
    await qc.invalidateQueries({ queryKey: ['balances'] });
  };
  return {
    add: async (t: TokenInfo) => save(mergeTokens(await loadCustomTokens(), [{ ...t, custom: true }])),
    remove: async (t: TokenInfo) =>
      save((await loadCustomTokens()).filter((x) => !(x.chain === t.chain && x.address.toLowerCase() === t.address.toLowerCase()))),
  };
}

export const findIn = (tokens: TokenInfo[], chain: string, address: string) =>
  tokens.find((t) => t.chain === chain && t.address.toLowerCase() === address.toLowerCase());
