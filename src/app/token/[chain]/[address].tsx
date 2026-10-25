import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button, Card, Screen, T } from '@/components/ui';
import { Skeleton } from '@/components/wallet';
import { getChain, type ChainKey } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { formatAmount } from '@/lib/format';
import { findIn, useAllTokens, useCustomTokenMutations } from '@/store/custom-tokens';

export default function TokenDetail() {
  const { chain, address } = useLocalSearchParams<{ chain: string; address: string }>();
  const { tokens } = useAllTokens();
  const { remove } = useCustomTokenMutations();
  const token = findIn(tokens, chain, address);
  const q = useBalances();
  if (!token) return <Screen><T variant="error">Unknown token</T></Screen>;
  const c = getChain(token.chain as ChainKey);
  const bal = q.data?.find((x) => x.chain === token.chain && x.address === token.address)?.balance;
  const explorer =
    token.address === NATIVE ? null : c.family === 'tron' ? `${c.explorerUrl}/#/token20/${token.address}` : `${c.explorerUrl}/token/${token.address}`;
  return (
    <Screen>
      <T variant="title">{token.name}</T>
      <T variant="caption">{c.name}</T>
      {q.isPending ? <Skeleton height={40} /> : <T variant="hero">{bal == null ? '—' : formatAmount(bal, token.decimals)} {token.symbol}</T>}
      <Card>
        <T variant="caption">Contract</T>
        <T variant="mono" selectable>{token.address === NATIVE ? 'Native gas token' : token.address}</T>
        {token.source && <T variant="caption">Address source: {token.source}</T>}
        {token.custom && <T variant="caption">Custom token (verified on-chain when imported)</T>}
      </Card>
      <Button title={`Send ${token.symbol}`} onPress={() => router.push({ pathname: '/send', params: { chain: token.chain, token: token.address } })} />
      <Button variant="secondary" title="Receive" onPress={() => router.push({ pathname: '/receive', params: { chain: token.chain } })} />
      {explorer && <Button variant="secondary" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorer)} />}
      {token.custom && <Button variant="danger" title="Remove token" onPress={() => remove(token).then(() => router.back())} />}
      {c.faucetUrl && <Button variant="secondary" title="Faucet" onPress={() => WebBrowser.openBrowserAsync(c.faucetUrl!)} />}
    </Screen>
  );
}
