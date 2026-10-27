import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Aurora } from '@/components/fx/skia';
import { Skeleton, TokenOrb } from '@/components/wallet';
import { Fonts, Radius, Tabular } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic, useMotion } from '@/motion';
import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

import { Button, Card, Screen, T } from '@/components/ui';
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
  const t = useTheme();
  const m = useMotion();
  useEffect(() => haptic.light(), []);
  if (!token) return <Screen><T variant="error">Unknown token</T></Screen>;
  const c = getChain(token.chain as ChainKey);
  const bal = q.data?.find((x) => x.chain === token.chain && x.address === token.address)?.balance;
  const explorer =
    token.address === NATIVE ? null : c.family === 'tron' ? `${c.explorerUrl}/#/token20/${token.address}` : `${c.explorerUrl}/token/${token.address}`;
  return (
    <Screen>
      <View style={{ borderRadius: Radius.xl, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 24, alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <Aurora intensity={0.6} />
        {/* "Shared-element-like": the orb pops in with a spring, title follows. Not a true shared transition. */}
        <Animated.View entering={m.pop()}>
          <TokenOrb chain={token.chain} symbol={token.symbol} size={72} />
        </Animated.View>
        <Animated.View entering={m.enter(1)} style={{ alignItems: 'center' }}>
          <T variant="title">{token.name}</T>
          <T variant="caption">{c.name}</T>
        </Animated.View>
        {q.isPending ? (
          <Skeleton height={40} />
        ) : (
          <Animated.View entering={m.enter(2)}>
            <T style={[{ fontFamily: Fonts.display, fontSize: 36, letterSpacing: -1, color: t.text }, Tabular]}>
              {bal == null ? '—' : formatAmount(bal, token.decimals)} <T style={{ fontFamily: Fonts.displayMedium, fontSize: 20, color: t.textSecondary }}>{token.symbol}</T>
            </T>
          </Animated.View>
        )}
      </View>
      <Card>
        <T variant="caption">Contract</T>
        <T variant="mono" selectable>{token.address === NATIVE ? 'Native gas token' : token.address}</T>
        {token.source && <T variant="caption">Address source: {token.source}</T>}
        {token.custom && <T variant="caption">Custom token (verified on-chain when imported)</T>}
      </Card>
      {c.family !== 'solana' && <Button title={`Send ${token.symbol}`} onPress={() => router.push({ pathname: '/send', params: { chain: token.chain, token: token.address } })} />}
      <Button variant="secondary" title="Receive" onPress={() => router.push({ pathname: '/receive', params: { chain: token.chain } })} />
      {explorer && <Button variant="secondary" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorer)} />}
      {token.custom && <Button variant="danger" title="Remove token" onPress={() => remove(token).then(() => router.back())} />}
      {c.faucetUrl && <Button variant="secondary" title="Faucet" onPress={() => WebBrowser.openBrowserAsync(c.faucetUrl!)} />}
    </Screen>
  );
}
