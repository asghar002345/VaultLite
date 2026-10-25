import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { Chip } from '@/components/wallet';
import { CHAINS } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { useBalances } from '@/hooks/use-balances';
import { validateAddress } from '@/lib/address';
import { parseAmount } from '@/lib/amount';
import { formatAmount } from '@/lib/format';
import { takeScan } from '@/lib/scan-bus';
import { findIn, useAllTokens } from '@/store/custom-tokens';

export default function Send() {
  const p = useLocalSearchParams<{ chain?: string; token?: string }>();
  const { tokens: TOKENS } = useAllTokens();
  const initial = (p.chain && p.token && findIn(TOKENS, p.chain, p.token)) || TOKENS[0];
  const [tokenKey, setTokenKey] = useState(`${initial.chain}:${initial.address}`);
  const token = TOKENS.find((t) => `${t.chain}:${t.address}` === tokenKey) ?? TOKENS[0];
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [scanNote, setScanNote] = useState<string | null>(null);

  // Pick up a result from /scan when we regain focus.
  useFocusEffect(
    useCallback(() => {
      const r = takeScan();
      if (!r || r.kind !== 'address') return;
      setTo(r.address);
      const cur = TOKENS.find((t) => `${t.chain}:${t.address}` === tokenKey);
      const famOk = cur && CHAINS[cur.chain].family === r.family && (!r.chainKey || cur.chain === r.chainKey);
      if (!famOk) {
        const chain = r.chainKey ?? (r.family === 'tron' ? 'tronNile' : 'sepolia');
        setTokenKey(`${chain}:${NATIVE}`);
        setScanNote(`Switched to ${CHAINS[chain as keyof typeof CHAINS].name} native token for this address`);
      } else setScanNote(null);
      if (r.amount && /^\d+$/.test(r.amount)) {
        const native = r.family === 'evm' ? 18 : 6; // EIP-681 value is wei; tron: amount is sun
        setAmount(formatAmount(BigInt(r.amount), native, native));
      }
    }, [TOKENS, tokenKey]),
  );
  const balances = useBalances();
  const bal = balances.data?.find((x) => x.chain === token.chain && x.address === token.address)?.balance ?? null;

  const family = CHAINS[token.chain].family;
  const addr = useMemo(() => (to ? validateAddress(family, to) : null), [family, to]);
  const amt = parseAmount(amount, token.decimals);
  const over = amt !== null && bal !== null && amt > bal;
  const ok = addr?.ok && amt !== null && !over;

  return (
    <Screen>
      <TestnetBanner />
      <T variant="caption">Asset</T>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
        {TOKENS.map((t) => (
          <Chip key={`${t.chain}:${t.address}`} label={`${t.symbol} · ${CHAINS[t.chain].name.replace(' Testnet', '')}`} active={tokenKey === `${t.chain}:${t.address}`} onPress={() => setTokenKey(`${t.chain}:${t.address}`)} />
        ))}
      </ScrollView>
      <T variant="caption">Recipient ({family === 'tron' ? 'T… base58' : '0x… EIP-55'})</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input testID="to" value={to} onChangeText={setTo} placeholder={family === 'tron' ? 'T…' : '0x…'} />
        </View>
        <Button variant="secondary" title="Scan" onPress={() => router.push({ pathname: '/scan', params: { mode: 'address' } })} />
      </View>
      {scanNote && <T variant="caption">{scanNote}</T>}
      {addr && !addr.ok && <T variant="error">{addr.reason}</T>}
      <T variant="caption">Amount</T>
      <Input testID="amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.0" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="caption">Balance: {bal === null ? '—' : `${formatAmount(bal, token.decimals)} ${token.symbol}`}</T>
        {bal !== null && <T variant="caption" onPress={() => setAmount(formatAmount(bal, token.decimals, token.decimals))}>Max</T>}
      </View>
      {amount !== '' && amt === null && <T variant="error">Invalid amount</T>}
      {over && <T variant="error">Exceeds balance</T>}
      <Button
        title="Review"
        disabled={!ok}
        onPress={() =>
          router.push({
            pathname: '/send/review',
            params: { chain: token.chain, token: token.address, to: addr && addr.ok ? addr.normalized : '', amount: amt!.toString() },
          })
        }
      />
    </Screen>
  );
}
