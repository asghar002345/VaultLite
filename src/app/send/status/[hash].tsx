import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button, Card, Screen, T } from '@/components/ui';
import { CHAINS, type ChainKey } from '@/config/chains';
import { evmTxState, explorerTxUrl, isEvmChain } from '@/services/evm';
import { tronTxState } from '@/services/tron';

export default function Status() {
  const { hash, chain } = useLocalSearchParams<{ hash: string; chain: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['tx', chain, hash],
    queryFn: async () => {
      const s = isEvmChain(chain) ? await evmTxState(chain, hash as `0x${string}`) : await tronTxState(hash);
      if (s.state !== 'pending') qc.invalidateQueries({ queryKey: ['balances'] });
      return s;
    },
    refetchInterval: (query) => (query.state.data?.state === 'pending' || !query.state.data ? 3000 : false),
  });
  const s = q.data;
  const c = CHAINS[chain as ChainKey];
  return (
    <Screen>
      <Card>
        <T variant="title" testID="tx-state">
          {!s || s.state === 'pending' ? 'Pending…' : s.state === 'success' ? 'Confirmed ✓' : 'Failed ✗'}
        </T>
        <T variant="caption">{c?.name}</T>
        {s && s.state !== 'pending' && s.block !== undefined && <T variant="caption">Block {s.block.toString()}</T>}
        {s?.state === 'failed' && s.reason && <T variant="error">{s.reason}</T>}
        <T variant="mono" selectable>{hash}</T>
      </Card>
      <Button variant="secondary" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(chain as ChainKey, hash))} />
      <Button title="Done" onPress={() => router.dismissTo('/home')} />
    </Screen>
  );
}
