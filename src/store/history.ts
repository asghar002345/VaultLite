import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { evmTxState, isEvmChain } from '@/services/evm';
import { tronTxState } from '@/services/tron';

import { addTx, pendingTxs, settleTx, type TxRecord } from './history-core';

const KEY = 'vaultlite.history.v1';
const QK = ['history'];

// Serialize writes so concurrent updates don't clobber each other.
let chain: Promise<unknown> = Promise.resolve();
async function load(): Promise<TxRecord[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}
function mutate(fn: (l: TxRecord[]) => TxRecord[]): Promise<TxRecord[]> {
  const p = chain.then(async () => {
    const next = fn(await load());
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });
  chain = p.catch(() => {});
  return p;
}

export const recordTx = (r: TxRecord) => mutate((l) => addTx(l, r));
export const clearHistory = () => mutate(() => []);

/** Polls pending txs every 5 s while any are pending; settles them in storage. */
export function useHistory(owner?: { evm: string; tron: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: QK,
    queryFn: async () => {
      let list = await load();
      const pend = pendingTxs(list);
      if (pend.length) {
        const results = await Promise.all(
          pend.map(async (t) => {
            try {
              const s = isEvmChain(t.chain)
                ? await evmTxState(t.chain, t.hash as `0x${string}`, t.from as `0x${string}`, t.nonce)
                : await tronTxState(t.hash);
              return { t, s };
            } catch {
              return { t, s: { state: 'pending' as const } };
            }
          }),
        );
        const settled = results.filter((r) => r.s.state !== 'pending');
        if (settled.length) {
          list = await mutate((l) =>
            settled.reduce(
              (acc, { t, s }) => settleTx(acc, t.hash, s.state as TxRecord['status'], 'block' in s && s.block !== undefined ? String(s.block) : undefined),
              l,
            ),
          );
          qc.invalidateQueries({ queryKey: ['balances'] });
        }
      }
      return list;
    },
    refetchInterval: (query) => (query.state.data && pendingTxs(query.state.data).length ? 5000 : false),
  });
  const mine = (q.data ?? []).filter(
    (t) => !owner || [owner.evm.toLowerCase(), owner.tron.toLowerCase()].includes(t.from.toLowerCase()),
  );
  const add = useCallback(
    async (r: TxRecord) => {
      await recordTx(r);
      qc.invalidateQueries({ queryKey: QK });
    },
    [qc],
  );
  return { ...q, list: mine, pending: pendingTxs(mine), add };
}
