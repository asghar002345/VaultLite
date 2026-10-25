import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { Chip, HoldToConfirm, Skeleton } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { useReauth } from '@/hooks/use-reauth';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { humanizeError } from '@/lib/errors';
import { canAfford, expectedFeeCost, maxFeeCost, type FeeTier } from '@/lib/fees';
import { formatAmount } from '@/lib/format';
import { isEvmChain, quoteEvmTx, sendEvmTx } from '@/services/evm';
import { broadcastTron, buildTronTransfer, estimateTronFee, signTronTx, TRC20_FEE_LIMIT } from '@/services/tron';
import { findIn, useAllTokens } from '@/store/custom-tokens';
import { useHistory } from '@/store/history';
import { useSession } from '@/vault/session';

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

  if (!token || !accounts) return <Screen><T variant="error">Invalid request</T></Screen>;
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
  return (
    <Screen>
      <TestnetBanner />
      <Card>
        <T variant="caption">Sending</T>
        <T variant="hero">{formatAmount(amount, token.decimals)} {token.symbol}</T>
        <T variant="caption">on {CHAINS[chain].name}</T>
        <T variant="caption">To</T>
        <T variant="mono" selectable>{p.to}</T>
      </Card>
      {evm ? (
        <Card>
          <T variant="caption">Network fee (EIP-1559)</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['slow', 'normal', 'fast'] as FeeTier[]).map((t) => (
              <Chip key={t} label={t} active={tier === t} onPress={() => setTier(t)} />
            ))}
          </View>
          {quote.isPending && <Skeleton height={40} />}
          {quote.isError && <T variant="error">Fee estimate failed: {humanizeError(quote.error)}</T>}
          {expected !== null && worst !== null && (
            <>
              <T>≈ {formatAmount(expected, 18, 8)} {nativeSym}</T>
              <T variant="caption">Max {formatAmount(worst, 18, 8)} {nativeSym} · gas limit {q!.gasLimit.toString()}</T>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <T variant="caption">Network fee (Tron resources)</T>
          {tronFee.isPending && <Skeleton height={40} />}
          {tronFee.isError && <T variant="error">Fee estimate failed: {humanizeError(tronFee.error)}</T>}
          {tf && (
            <>
              <T>{tf.totalSun === 0 ? 'Free (covered by your bandwidth/energy)' : `≈ ${formatAmount(BigInt(tf.totalSun), 6)} TRX burned`}</T>
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
            </>
          )}
        </Card>
      )}
      {!affordable && <T variant="error">Not enough {nativeSym} for {isNative ? 'amount + ' : ''}max fee</T>}
      {auth.needsPin && (
        <Input testID="pin" value={auth.pin} onChangeText={auth.setPin} placeholder="PIN to confirm" secureTextEntry keyboardType="number-pad" maxLength={6} />
      )}
      {error && <T variant="error">{error}</T>}
      <HoldToConfirm label="Hold to send" disabled={!feeLoaded || !affordable || !auth.ready} onConfirm={confirm} />
    </Screen>
  );
}
