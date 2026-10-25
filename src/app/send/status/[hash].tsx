import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { Button, Card, Input, Screen, T } from '@/components/ui';
import { CHAINS, type ChainKey } from '@/config/chains';
import { useReauth } from '@/hooks/use-reauth';
import { humanizeError } from '@/lib/errors';
import { bumpFees } from '@/lib/fees';
import { formatAmount } from '@/lib/format';
import { callFor, evmTxState, explorerTxUrl, isEvmChain, marketFee, replaceEvmTx } from '@/services/evm';
import { tronTxState } from '@/services/tron';
import { canReplace, type TxRecord } from '@/store/history-core';
import { useHistory } from '@/store/history';
import { useSession } from '@/vault/session';

const LABEL = { pending: 'Pending…', success: 'Confirmed ✓', failed: 'Failed ✗', replaced: 'Replaced ↺' } as const;

export default function Status() {
  const { hash, chain } = useLocalSearchParams<{ hash: string; chain: string }>();
  const qc = useQueryClient();
  const history = useHistory();
  const rec = history.data?.find((t) => t.hash === hash);
  const q = useQuery({
    queryKey: ['tx', chain, hash],
    queryFn: async () => {
      const s = isEvmChain(chain)
        ? await evmTxState(chain, hash as `0x${string}`, rec?.from as `0x${string}` | undefined, rec?.nonce)
        : await tronTxState(hash);
      if (s.state !== 'pending') {
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['history'] });
      }
      return s;
    },
    refetchInterval: (query) => (query.state.data?.state === 'pending' || !query.state.data ? 3000 : false),
  });
  const s = q.data;
  const state = s?.state ?? 'pending';
  const c = CHAINS[chain as ChainKey];
  const replaceable = rec && isEvmChain(chain) && state === 'pending' && canReplace(history.data ?? [], rec);
  const successor = rec?.replacedBy;

  return (
    <Screen>
      <Card>
        <T variant="title" testID="tx-state">{LABEL[state]}</T>
        {rec && (
          <T>
            {rec.kind === 'cancel' ? 'Cancel (0 to self)' : `${formatAmount(BigInt(rec.amount), rec.decimals)} ${rec.symbol}`}
            {rec.kind === 'speedup' ? ' · sped up' : ''}
          </T>
        )}
        <T variant="caption">{c?.name}{rec?.nonce !== undefined ? ` · nonce ${rec.nonce}` : ''}</T>
        {s && 'block' in s && s.block !== undefined && <T variant="caption">Block {s.block.toString()}</T>}
        {s?.state === 'failed' && s.reason && <T variant="error">{s.reason}</T>}
        {state === 'replaced' && <T variant="caption">Another transaction with the same nonce was mined instead.</T>}
        <T variant="mono" selectable>{hash}</T>
      </Card>
      {successor && (
        <Button variant="secondary" title="Open replacement" onPress={() => router.replace({ pathname: '/send/status/[hash]', params: { hash: successor, chain } })} />
      )}
      {replaceable && <ReplaceActions rec={rec} onDone={(h) => router.replace({ pathname: '/send/status/[hash]', params: { hash: h, chain } })} />}
      <Button variant="secondary" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorerTxUrl(chain as ChainKey, hash))} />
      <Button title="Done" onPress={() => router.dismissTo('/home')} />
    </Screen>
  );
}

function ReplaceActions({ rec, onDone }: { rec: TxRecord; onDone: (hash: string) => void }) {
  const { withKeys } = useSession();
  const history = useHistory();
  const auth = useReauth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (mode: 'speedup' | 'cancel') => {
    setErr(null);
    const a = await auth.verify();
    if (a) return setErr(a);
    setBusy(true);
    try {
      const chain = rec.chain as Parameters<typeof marketFee>[0];
      const fees = bumpFees(
        { maxFeePerGas: BigInt(rec.maxFeePerGas!), maxPriorityFeePerGas: BigInt(rec.maxPriorityFeePerGas!) },
        await marketFee(chain).catch(() => undefined),
      );
      const call = callFor({
        chain,
        from: rec.from as `0x${string}`,
        to: rec.to as `0x${string}`,
        amount: BigInt(rec.amount),
        token: { chain: rec.chain, address: rec.tokenAddress, symbol: rec.symbol, name: rec.symbol, decimals: rec.decimals },
      });
      const gasLimit = BigInt(rec.gasLimit ?? '21000');
      const hash = await withKeys((k) =>
        replaceEvmTx(mode, { chain, from: rec.from as `0x${string}`, nonce: rec.nonce!, call, gasLimit, fees }, k.evm),
      );
      await history.add({
        ...rec,
        hash,
        kind: mode,
        status: 'pending',
        createdAt: Date.now(),
        replaces: rec.hash,
        replacedBy: undefined,
        ...(mode === 'cancel' ? { to: rec.from, amount: '0', gasLimit: '21000' } : {}),
        maxFeePerGas: fees.maxFeePerGas.toString(),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      });
      onDone(hash);
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T variant="caption">Stuck? Replace it using the same nonce (fees +12.5% or current market, whichever is higher).</T>
      {auth.needsPin && <Input value={auth.pin} onChangeText={auth.setPin} placeholder="PIN" secureTextEntry keyboardType="number-pad" maxLength={6} />}
      {err && <T variant="error">{err}</T>}
      <Button title={busy ? 'Working…' : 'Speed up'} disabled={busy || !auth.ready} onPress={() => run('speedup')} />
      <Button variant="danger" title="Cancel transaction" disabled={busy || !auth.ready} onPress={() => run('cancel')} />
    </Card>
  );
}
