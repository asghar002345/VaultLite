import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Notice } from '@/components/states';
import { Button, Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { Chip } from '@/components/wallet';
import { CHAIN_LIST, CHAINS, type ChainKey } from '@/config/chains';
import { validateAddress } from '@/lib/address';
import { humanizeError } from '@/lib/errors';
import { isEvmChain, verifyErc20 } from '@/services/evm';
import { verifyTrc20 } from '@/services/tron';
import { findIn, useAllTokens, useCustomTokenMutations } from '@/store/custom-tokens';

type Meta = { symbol: string; name: string; decimals: number };

export default function AddToken() {
  const [chain, setChain] = useState<ChainKey>('sepolia');
  const [address, setAddress] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { tokens } = useAllTokens();
  const { add } = useCustomTokenMutations();
  const family = CHAINS[chain].family;
  const v = address ? validateAddress(family, address) : null;

  const verify = async () => {
    if (!v?.ok) return;
    setErr(null);
    setMeta(null);
    if (findIn(tokens, chain, v.normalized)) return setErr('Token already in your list');
    setBusy(true);
    try {
      setMeta(isEvmChain(chain) ? await verifyErc20(chain, v.normalized as `0x${string}`) : await verifyTrc20(v.normalized));
    } catch (e) {
      setErr(humanizeError(e).startsWith('The contract rejected') ? 'Not an ERC-20/TRC-20 contract (decimals()/symbol() failed)' : humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TestnetBanner />
      <T variant="caption">Network</T>
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
        {CHAIN_LIST.filter((c) => c.family !== 'solana').map((c) => (
          <Chip key={c.key} label={c.name.replace(' Testnet', '')} active={chain === c.key} onPress={() => { setChain(c.key as ChainKey); setMeta(null); }} />
        ))}
      </ScrollView>
      <T variant="caption">Token contract</T>
      <Input value={address} onChangeText={(x) => { setAddress(x); setMeta(null); }} placeholder={family === 'tron' ? 'T…' : '0x…'} />
      {v && !v.ok && <T variant="error">{v.reason}</T>}
      <Button title={busy ? 'Checking on-chain…' : 'Verify'} disabled={!v?.ok || busy} onPress={verify} />
      {err && <Notice tone="danger">{err}</Notice>}
      {meta && v?.ok && (
        <Card>
          <T variant="title">{meta.symbol}</T>
          <T>{meta.name} · {meta.decimals} decimals</T>
          <T variant="caption">Read from the contract on {CHAINS[chain].name}. Anyone can deploy a token with any name — only add contracts you trust.</T>
          <Button
            title="Add token"
            onPress={async () => {
              await add({ chain, address: v.normalized, ...meta, custom: true });
              router.back();
            }}
          />
        </Card>
      )}
    </Screen>
  );
}
