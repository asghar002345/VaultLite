import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Guilloche } from '@/components/fx/guilloche';
import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, ListRow, Notice, Section } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { Chip, HoldToConfirm, Skeleton } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { useReauth } from '@/hooks/use-reauth';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { humanizeError } from '@/lib/errors';
import { canAfford, expectedFeeCost, maxFeeCost, type FeeTier } from '@/lib/fees';
import { formatAmount } from '@/lib/format';
import { recipientRisk } from '@/lib/recipient-risk';
import { isEvmChain, publicClient, quoteEvmTx, sendEvmTx } from '@/services/evm';
import { broadcastTron, buildTronTransfer, estimateTronFee, signTronTx, TRC20_FEE_LIMIT } from '@/services/tron';
import { findIn, useAllTokens } from '@/store/custom-tokens';
import { useHistory } from '@/store/history';
import { useSession } from '@/vault/session';
import { alpha, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Module-level so the React Compiler lint doesn't treat it as a render-time impure call.
const nowMs = () => Date.now();

export default function Review() {
  useSecureScreen('send-review');
  const p = useLocalSearchParams<{ chain: string; token: string; to: string; amount: string }>();
  const { tokens } = useAllTokens();
  const token = findIn(tokens, p.chain, p.token);
  const amount = BigInt(p.amount ?? '0');
  const { accounts, withKeys } = useSession();
  const auth = useReauth();
  const history = useHistory();
  const [tier, setTier] = useState<FeeTier>('normal');
  const [error, setError] = useState<string | null>(null);
  const balances = useBalances();

  const chain = p.chain as ChainKey;
  const evm = isEvmChain(chain);
  const nativeSym = CHAINS[chain]?.nativeCurrency.symbol ?? '';
  const nativeBal = balances.data?.find((x) => x.chain === chain && x.address === NATIVE)?.balance ?? null;
  const isNative = token?.address === NATIVE;

  const quote = useQuery({
    queryKey: ['quote', p.chain, p.token, p.to, p.amount],
    enabled: !!token && !!accounts && evm,
    refetchInterval: 15_000,
    queryFn: () => quoteEvmTx({ chain: chain as never, from: accounts!.evm.address, to: p.to as `0x${string}`, token: token!, amount }),
  });
  const tronFee = useQuery({
    queryKey: ['tronFee', p.token, p.to, p.amount],
    enabled: !!token && !!accounts && !evm,
    refetchInterval: 30_000,
    queryFn: () => estimateTronFee(accounts!.tron.address, p.to, token!, amount),
  });

  const code = useQuery({
    queryKey: ['code', p.chain, p.to],
    enabled: evm && !!p.to,
    staleTime: 60_000,
    queryFn: () => publicClient(chain as never).getCode({ address: p.to as `0x${string}` }),
  });
  const [ack, setAck] = useState(false);
  const t = useTheme();

  if (!token || !accounts) return <Screen><EmptyState icon="send" title="Nothing to review" body="This transfer is missing its token or amount." action={{ label: 'Start a transfer', onPress: () => router.replace('/send') }} /></Screen>;
  const q = quote.data;
  const fee = q ? q.tiers[tier] : null;
  const worst = evm ? (q && fee ? maxFeeCost(q.gasLimit, fee) : null) : tronFee.data ? BigInt(tronFee.data.totalSun) : null;
  const expected = q && fee ? expectedFeeCost(q.gasLimit, q.baseFeePerGas, fee) : null;
  const affordable = worst === null || nativeBal === null ? true : canAfford(nativeBal, worst, isNative ? amount : 0n);
  const feeLoaded = evm ? !!fee : tronFee.isSuccess;

  const confirm = async () => {
    setError(null);
    const authErr = await auth.verify();
    if (authErr) return setError(authErr);
    try {
      const base = {
        chain,
        kind: 'send' as const,
        to: p.to,
        tokenAddress: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        amount: amount.toString(),
        status: 'pending' as const,
        createdAt: nowMs(),
      };
      const hash = await withKeys(async (k) => {
        if (evm) {
          const r = await sendEvmTx({ chain: chain as never, from: accounts.evm.address, to: p.to as `0x${string}`, token, amount }, k.evm, q!.gasLimit, fee!);
          await history.add({
            ...base,
            hash: r.hash,
            from: accounts.evm.address,
            nonce: r.nonce,
            gasLimit: q!.gasLimit.toString(),
            maxFeePerGas: fee!.maxFeePerGas.toString(),
            maxPriorityFeePerGas: fee!.maxPriorityFeePerGas.toString(),
          });
          return r.hash;
        }
        const tx = await buildTronTransfer(accounts.tron.address, p.to, token, amount);
        const txid = await broadcastTron(signTronTx(tx, k.tron));
        await history.add({ ...base, hash: txid, from: accounts.tron.address });
        return txid;
      });
      router.replace({ pathname: '/send/status/[hash]', params: { hash, chain } });
    } catch (e) {
      setError(humanizeError(e));
    }
  };

  const tf = tronFee.data;
  const risk = evm ? recipientRisk(p.to, isNative ? null : token.address, code.data) : null;
  const danger = !!risk;
  const short = (x: string) => `${x.slice(0, 8)}…${x.slice(-6)}`;
  return (
    <Screen testID={danger ? 'send-review-danger' : 'send-review'}>
      {danger && (
        <View testID="danger-block" accessibilityRole="alert" style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: alpha(t.danger, 0.6), backgroundColor: alpha(t.danger, 0.1), padding: Spacing.lg, gap: Spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'center' }}>
            <Icon name="danger" tint={t.danger} size="lg" />
            <T variant="title" style={{ flex: 1, fontSize: 24, lineHeight: 30 }}>{risk === 'token-contract' ? 'Sending to the token contract' : 'Recipient is a contract'}</T>
          </View>
          <T style={{ color: t.text }}>
            {risk === 'token-contract'
              ? `The recipient is the ${token.symbol} contract itself. Tokens sent there are almost always lost.`
              : 'This address has contract code. If it cannot handle incoming transfers, the funds may be lost.'}
          </T>
        </View>
      )}
      <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: Spacing.lg, gap: Spacing.sm, alignItems: 'center', overflow: 'hidden' }}>
        {!danger && <Guilloche />}
        <T variant="overline">Outbound transfer</T>
        <T variant="hero" testID="review-amount">
          −{formatAmount(amount, token.decimals)} <T style={{ fontFamily: Fonts.display, fontSize: 22, color: danger ? t.danger : t.primary }}>{token.symbol}</T>
        </T>
      </View>
      <Section group>
        <ListRow icon="send" title="Recipient" value={short(p.to)} right={risk ? <T variant="overline" style={{ color: t.danger }}>Contract</T> : undefined} />
        <ListRow icon="wallet" title="From" value={short(evm ? accounts.evm.address : accounts.tron.address)} />
        <ListRow icon="network" title="Network" value={CHAINS[chain].name} />
      </Section>
      {evm ? (
        <Section title="Network fee · EIP-1559">
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {(['slow', 'normal', 'fast'] as FeeTier[]).map((x) => (
              <Chip key={x} label={x} active={tier === x} onPress={() => setTier(x)} />
            ))}
          </View>
          {quote.isPending && <Skeleton height={40} />}
          {quote.isError && <ErrorState title="Fee estimate failed" error={quote.error} onRetry={() => quote.refetch()} />}
          {expected !== null && worst !== null && (
            <View style={{ gap: Spacing.xs }}>
              <T variant="amount">≈ {formatAmount(expected, 18, 8)} {nativeSym}</T>
              <T variant="caption" style={{ fontFamily: Fonts.mono }}>Max {formatAmount(worst, 18, 8)} {nativeSym} · gas {q!.gasLimit.toString()}</T>
            </View>
          )}
        </Section>
      ) : (
        <Section title="Network fee · Tron resources">
          {tronFee.isPending && <Skeleton height={40} />}
          {tronFee.isError && <ErrorState title="Fee estimate failed" error={tronFee.error} onRetry={() => tronFee.refetch()} />}
          {tf && (
            <View style={{ gap: Spacing.xs }}>
              <T variant="amount">{tf.totalSun === 0 ? 'Free (covered by your bandwidth/energy)' : `≈ ${formatAmount(BigInt(tf.totalSun), 6)} TRX burned`}</T>
              <T variant="caption">
                Bandwidth {tf.bandwidth} (have {tf.resources.bandwidthLeft}){tf.bandwidthSun ? ` → ${formatAmount(BigInt(tf.bandwidthSun), 6)} TRX` : ' → free'}
              </T>
              {!isNative && (
                <T variant="caption">
                  Energy {tf.energy} (have {tf.resources.energyLeft}){tf.energySun ? ` → ${formatAmount(BigInt(tf.energySun), 6)} TRX` : ' → free'} · fee limit {TRC20_FEE_LIMIT / 1e6} TRX
                </T>
              )}
              {!tf.recipientActivated && (
                <T variant="caption">Recipient not activated yet: +{formatAmount(BigInt(tf.activationSun), 6)} TRX account-creation fee</T>
              )}
            </View>
          )}
        </Section>
      )}
      {!affordable && <Notice tone="disabled">Not enough {nativeSym} for {isNative ? 'amount + ' : ''}max fee</Notice>}
      {danger && (
        <Pressable testID="ack-risk" accessibilityRole="checkbox" accessibilityState={{ checked: ack }} onPress={() => setAck((v) => !v)} style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: ack ? t.danger : t.border, backgroundColor: ack ? t.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {ack ? <Icon name="check" size="sm" tint={t.onDanger} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <T variant="label">I understand the risk</T>
            <T variant="caption">I have checked that this contract can receive {token.symbol}.</T>
          </View>
        </Pressable>
      )}
      {auth.needsPin && (
        <Input testID="pin" value={auth.pin} onChangeText={auth.setPin} placeholder="PIN to confirm" secureTextEntry keyboardType="number-pad" maxLength={6} />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <HoldToConfirm danger={danger} label={danger ? 'Hold to send anyway' : 'Hold to send'} disabled={!feeLoaded || !affordable || !auth.ready || (danger && !ack)} onConfirm={confirm} />
      <Button variant="ghost" title="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
    </Screen>
  );
}
