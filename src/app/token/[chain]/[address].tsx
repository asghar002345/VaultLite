import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import * as Clipboard from 'expo-clipboard';
import { Guilloche } from '@/components/fx/guilloche';
import { Icon } from '@/components/icon';
import { TokenOrb } from '@/components/wallet';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic, useMotion } from '@/motion';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';

import { ConfirmSheet, EmptyState, ErrorState, ListRow, LoadingState, Section } from '@/components/states';
import { Button, Screen, T, TestnetBanner } from '@/components/ui';
import { getChain, type ChainKey } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { formatAmount } from '@/lib/format';
import { findIn, useAllTokens, useCustomTokenMutations } from '@/store/custom-tokens';
import { FreshnessLabel, PriceChange, REFERENCE_LABEL } from '@/components/market';
import { useAssetQuote } from '@/hooks/use-market';
import { formatPrice } from '@/services/market/format';
import { useOffline } from '@/services/market/offline';

export default function TokenDetail() {
  const { chain, address } = useLocalSearchParams<{ chain: string; address: string }>();
  const { tokens } = useAllTokens();
  const { remove } = useCustomTokenMutations();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const token = findIn(tokens, chain, address);
  const q = useBalances();
  const t = useTheme();
  const m = useMotion();
  useEffect(() => haptic.light(), []);
  const mq = useAssetQuote(token ?? null);
  const offlineNow = useOffline();
  if (!token) return <Screen><EmptyState icon="wallet" title="Unknown token" body="This token isn't in your list. Import it by contract address." action={{ label: 'Add custom token', onPress: () => router.push('/tokens/add') }} /></Screen>;
  const c = getChain(token.chain as ChainKey);
  const bal = q.data?.find((x) => x.chain === token.chain && x.address === token.address)?.balance;
  const explorer =
    token.address === NATIVE ? null : c.family === 'tron' ? `${c.explorerUrl}/#/token20/${token.address}` : `${c.explorerUrl}/token/${token.address}`;
  const short = (x: string) => (x.length > 14 ? `${x.slice(0, 6)}…${x.slice(-4)}` : x);
  return (
    <Screen testID="token-detail">
      <Stack.Screen options={{ title: token.symbol }} />
      <Animated.View entering={m.enter(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <TokenOrb chain={token.chain} symbol={token.symbol} size={48} />
        <View style={{ flex: 1 }}>
          <T variant="title">{token.name}</T>
          <T variant="caption">{c.name}</T>
        </View>
        <TestnetBanner />
      </Animated.View>
      <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: Spacing.lg, gap: Spacing.sm, overflow: 'hidden' }}>
        <Guilloche />
        <T variant="overline">Your holding</T>
        {q.isPending ? (
          <LoadingState rows={1} height={52} label="Loading balance" />
        ) : q.isError ? (
          <ErrorState title="Couldn't load balance" error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <Animated.View entering={m.enter(1)}>
            <T variant="hero" testID="token-balance">
              {bal == null ? '—' : formatAmount(bal, token.decimals, 6)} <T style={{ fontFamily: Fonts.display, fontSize: 22, color: t.primary }}>{token.symbol}</T>
            </T>
          </Animated.View>
        )}
      </View>
      <Section title="Market price">
        <View testID="token-market" style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: Spacing.lg, gap: Spacing.sm }}>
          <T variant="footnote">{REFERENCE_LABEL} · not the value of this testnet balance</T>
          {mq.q.ref.kind === 'quote' ? (
            <T variant="body">USDT is the quote currency for Binance prices (1 USDT = 1 USDT).</T>
          ) : mq.q.ref.kind === 'unavailable' ? (
            <T variant="body" testID="market-unavailable">Market price unavailable. {mq.q.ref.reason}.</T>
          ) : mq.q.ticker ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' }}>
                <T variant="headline" style={{ fontVariant: ['tabular-nums'] }}>{formatPrice(mq.q.ticker.last, mq.q.tickDecimals)} USDT</T>
                <PriceChange pct={mq.q.ticker.changePct} />
              </View>
              <FreshnessLabel freshness={mq.q.freshness} receivedAt={mq.q.ticker.receivedAt} offline={offlineNow} />
              <Button variant="ghost" icon="markets" title={`Open ${mq.q.ref.symbol} chart`} onPress={() => router.push({ pathname: '/markets/[symbol]', params: { symbol: (mq.q.ref as { symbol: string }).symbol } })} />
            </>
          ) : mq.rest.error ? (
            <ErrorState title="Couldn't load market price" error={mq.rest.error} onRetry={() => mq.rest.refetch()} />
          ) : (
            <LoadingState rows={1} height={40} label="Loading market price" />
          )}
        </View>
      </Section>
      <Section title="Details" group>
        <ListRow icon="network" title="Network" value={c.name} />
        {c.chainId ? <ListRow icon="info" title="Chain ID" value={String(c.chainId)} /> : null}
        <ListRow icon="key" title="Contract" value={token.address === NATIVE ? 'Native gas token' : short(token.address)} onPress={token.address === NATIVE ? undefined : () => Clipboard.setStringAsync(token.address)} right={token.address === NATIVE ? undefined : <Icon name="copy" size="sm" color="textTertiary" />} />
        {token.source ? <ListRow icon="info" title="Address source" value={token.source} /> : null}
        {token.custom ? <ListRow icon="check" title="Custom token" subtitle="Verified on-chain when imported" /> : null}
      </Section>
      <View style={{ flexDirection: 'row', gap: Spacing.smd }}>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" icon="receive" title="Receive" onPress={() => router.push({ pathname: '/receive', params: { chain: token.chain } })} />
        </View>
        {c.family !== 'solana' && (
          <View style={{ flex: 1 }}>
            <Button icon="send" title="Send" onPress={() => router.push({ pathname: '/send', params: { chain: token.chain, token: token.address } })} />
          </View>
        )}
      </View>
      <View style={{ gap: Spacing.xs }}>
        {explorer && <Button variant="ghost" icon="external" title="View on explorer" onPress={() => WebBrowser.openBrowserAsync(explorer)} />}
        {c.faucetUrl && <Button variant="ghost" icon="external" title="Get test tokens (faucet)" onPress={() => WebBrowser.openBrowserAsync(c.faucetUrl!)} />}
        {token.custom && <Button variant="ghost" icon="trash" title="Remove token" onPress={() => setConfirmRemove(true)} />}
      </View>
      {token.custom && (
        <ConfirmSheet
          visible={confirmRemove}
          danger
          title={`Remove ${token.symbol}?`}
          body="It disappears from your token list. Any balance stays on-chain; you can import it again later."
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => remove(token).then(() => { setConfirmRemove(false); router.back(); })}
        />
      )}
    </Screen>
  );
}
