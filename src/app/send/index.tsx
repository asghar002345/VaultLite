import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Keypad } from '@/components/keypad';
import { Field } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { Chip } from '@/components/wallet';
import { CHAINS } from '@/config/chains';
import { NATIVE } from '@/config/tokens';
import { Fonts, Radius, Spacing, Tabular } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBalances } from '@/hooks/use-balances';
import { validateAddress } from '@/lib/address';
import { parseAmount } from '@/lib/amount';
import { formatAmount } from '@/lib/format';
import { applyKey } from '@/lib/keypad';
import { takeScan } from '@/lib/scan-bus';
import { findIn, useAllTokens } from '@/store/custom-tokens';

export default function Send() {
  const p = useLocalSearchParams<{ chain?: string; token?: string }>();
  const { tokens: ALL } = useAllTokens();
  // Solana is receive/balance-only for now.
  const TOKENS = useMemo(() => ALL.filter((t) => CHAINS[t.chain].family !== 'solana'), [ALL]);
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
      if (r.tokenAddress) {
        // EIP-681 ERC-20 transfer: pick that token if we know it.
        const chain = r.chainKey ?? TOKENS.find((t) => t.address.toLowerCase() === r.tokenAddress!.toLowerCase())?.chain;
        const tok = chain ? findIn(TOKENS, chain, r.tokenAddress) : undefined;
        if (!tok) {
          setScanNote(`Unknown token ${r.tokenAddress}${r.chainKey ? '' : ' (no chain id)'} — add it under "Add custom token" first.`);
          setAmount('');
          return;
        }
        setTokenKey(`${tok.chain}:${tok.address}`);
        setScanNote(`Token transfer request: ${tok.symbol} on ${CHAINS[tok.chain].name}`);
        if (r.amount) setAmount(formatAmount(BigInt(r.amount), tok.decimals, tok.decimals));
        return;
      }
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

  const t = useTheme();
  const onKey = useCallback((k: string) => setAmount((v) => applyKey(v, k, { decimal: true, maxLength: 24 })), []);
  const amountError = amount !== '' && amt === null ? 'Invalid amount' : over ? 'Exceeds balance' : null;

  return (
    <Screen testID="send">
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.sm }} showsHorizontalScrollIndicator={false}>
        {TOKENS.map((x) => (
          <Chip key={`${x.chain}:${x.address}`} label={`${x.symbol} · ${CHAINS[x.chain].name.replace(' Testnet', '')}`} active={tokenKey === `${x.chain}:${x.address}`} onPress={() => setTokenKey(`${x.chain}:${x.address}`)} />
        ))}
      </ScrollView>
      <Field label={`Recipient · ${family === 'tron' ? 'T… base58' : '0x… EIP-55'}`} helper={scanNote ?? undefined} error={addr && !addr.ok ? addr.reason : null}>
        <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Input testID="to" value={to} onChangeText={setTo} placeholder={family === 'tron' ? 'T…' : '0x…'} autoCapitalize="none" autoCorrect={false} style={{ fontFamily: Fonts.mono, fontSize: 13 }} />
          </View>
          <Pressable testID="send-scan" accessibilityRole="button" accessibilityLabel="Scan address QR" onPress={() => router.push({ pathname: '/scan', params: { mode: 'address' } })} style={{ width: 56, height: 56, borderRadius: Radius.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="scan" color="textSecondary" />
          </Pressable>
        </View>
      </Field>
      <View style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: amountError ? t.danger : t.border, backgroundColor: t.surface, padding: Spacing.lg, gap: Spacing.sm, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
          <T variant="overline">Amount</T>
          {bal !== null && (
            <Pressable testID="send-max" accessibilityRole="button" accessibilityLabel="Use maximum balance" onPress={() => setAmount(formatAmount(bal, token.decimals, token.decimals))} style={{ paddingHorizontal: Spacing.smd, paddingVertical: Spacing.xs, borderRadius: Radius.sm, backgroundColor: t.surfaceRaised }}>
              <T variant="overline" style={{ color: t.primary }}>Max</T>
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: Spacing.sm }}>
          <TextInput
            testID="amount"
            accessibilityLabel="Amount"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={t.textTertiary}
            keyboardType="decimal-pad"
            showSoftInputOnFocus={false}
            style={[{ fontFamily: Fonts.ui, fontWeight: '300', fontVariant: ['tabular-nums'], fontSize: 56, lineHeight: 64, color: t.text, textAlign: 'center', width: Math.min(260, Math.max(1, (amount || '0').length) * 27 + 12), padding: 0 }, Tabular]}
          />
          <T style={{ fontFamily: Fonts.display, fontSize: 24, color: t.primary }}>{token.symbol}</T>
        </View>
        <T variant="caption" style={{ fontFamily: Fonts.mono }}>Available: {bal === null ? '—' : `${formatAmount(bal, token.decimals)} ${token.symbol}`}</T>
        {amountError ? <T variant="error">{amountError}</T> : null}
      </View>
      <Keypad onKey={onKey} testIDPrefix="amt" left={{ key: '.', label: '.', accessibilityLabel: 'Decimal point' }} />
      <Button
        testID="send-review"
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
