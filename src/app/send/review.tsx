import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { Chip, HoldToConfirm, Skeleton } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { NATIVE, findToken, TOKENS } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { canAfford, expectedFeeCost, maxFeeCost, type FeeTier } from '@/lib/fees';
import { formatAmount } from '@/lib/format';
import { isEvmChain, quoteEvmTx, sendEvmTx } from '@/services/evm';
import { broadcastTron, buildTronTransfer, signTronTx, TRC20_FEE_LIMIT } from '@/services/tron';
import { useSession } from '@/vault/session';

export default function Review() {
  const p = useLocalSearchParams<{ chain: string; token: string; to: string; amount: string }>();
  const token = findToken(p.chain, p.token);
  const amount = BigInt(p.amount ?? '0');
  const { accounts, reauth, canBiometricReauth, withKeys } = useSession();
  const [tier, setTier] = useState<FeeTier>('normal');
  const [pin, setPin] = useState('');
  const [bio, setBio] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const balances = useBalances();
  useEffect(() => void canBiometricReauth().then(setBio), [canBiometricReauth]);

  const chain = p.chain as ChainKey;
  const evm = isEvmChain(chain);
  const native = TOKENS.find((t) => t.chain === chain && t.address === NATIVE)!;
  const nativeBal = balances.data?.find((x) => x.chain === chain && x.address === NATIVE)?.balance ?? null;

  const quote = useQuery({
    queryKey: ['quote', p.chain, p.token, p.to, p.amount],
    enabled: !!token && !!accounts && evm,
    refetchInterval: 15_000,
    queryFn: () =>
      quoteEvmTx({ chain: chain as never, from: accounts!.evm.address, to: p.to as `0x${string}`, token: token!, amount }),
  });

  if (!token || !accounts) return <Screen><T variant="error">Invalid request</T></Screen>;
  const q = quote.data;
  const fee = q ? q.tiers[tier] : null;
  const worst = q && fee ? maxFeeCost(q.gasLimit, fee) : null;
  const expected = q && fee ? expectedFeeCost(q.gasLimit, q.baseFeePerGas, fee) : null;
  const affordable =
    !evm || worst === null || nativeBal === null ? true : canAfford(nativeBal, worst, token.address === NATIVE ? amount : 0n);

  const confirm = async () => {
    setError(null);
    const ok = bio ? await reauth() : await reauth(pin);
    if (!ok) return setError(bio ? 'Biometric check failed' : 'Wrong PIN');
    try {
      const hash = await withKeys(async (k) => {
        if (evm) {
          return sendEvmTx({ chain: chain as never, from: accounts.evm.address, to: p.to as `0x${string}`, token, amount }, k.evm, q!.gasLimit, fee!);
        }
        const tx = await buildTronTransfer(accounts.tron.address, p.to, token, amount);
        return broadcastTron(signTronTx(tx, k.tron));
      });
      router.replace({ pathname: '/send/status/[hash]', params: { hash, chain } });
    } catch (e) {
      setError((e as Error).message.split('\n')[0]);
    }
  };

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
          {quote.isError && <T variant="error">Fee estimate failed: {quote.error.message.split('\n')[0]}</T>}
          {expected !== null && worst !== null && (
            <>
              <T>≈ {formatAmount(expected, 18, 8)} {native.symbol}</T>
              <T variant="caption">Max {formatAmount(worst, 18, 8)} {native.symbol} · gas limit {q!.gasLimit.toString()}</T>
            </>
          )}
          {!affordable && <T variant="error">Not enough {native.symbol} for amount + max fee</T>}
        </Card>
      ) : (
        <Card>
          <T variant="caption">Network fee</T>
          <T variant="caption">
            {token.address === NATIVE
              ? 'TRX transfers use bandwidth (free daily quota, else burns a small amount of TRX).'
              : `TRC-20 transfers burn energy; fee limit ${TRC20_FEE_LIMIT / 1e6} TRX.`}
          </T>
        </Card>
      )}
      {bio === false && <Input testID="pin" value={pin} onChangeText={setPin} placeholder="PIN to confirm" secureTextEntry keyboardType="number-pad" maxLength={6} />}
      {error && <T variant="error">{error}</T>}
      <HoldToConfirm
        label="Hold to send"
        disabled={(evm && !fee) || !affordable || bio === null || (bio === false && pin.length !== 6)}
        onConfirm={confirm}
      />
    </Screen>
  );
}
