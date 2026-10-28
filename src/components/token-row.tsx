import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { T, usePressScale } from '@/components/ui';
import { TokenOrb } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { humanizeError } from '@/lib/errors';
import { formatAmount } from '@/lib/format';
import { haptic, useMotion } from '@/motion';
import { RowMarketPrice } from '@/components/market';
import type { Quote } from '@/hooks/use-market';

export interface BalanceRow {
  chain: ChainKey;
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint | null;
  error?: unknown;
}

export { previewRows } from '@/lib/preview';

/** One asset row: monogram, symbol + network, tabular amount. Links to token detail. */
export function TokenRow({ item, index, quote }: { item: BalanceRow; index: number; quote?: Quote }) {
  const t = useTheme();
  const m = useMotion();
  const press = usePressScale(0.98);
  const amount = item.balance === null ? null : formatAmount(item.balance, item.decimals, 4);
  return (
    <Animated.View entering={m.enter(index)} style={press.style}>
      <Link href={{ pathname: '/token/[chain]/[address]', params: { chain: item.chain, address: item.address } }} asChild>
        <Pressable
          onPressIn={() => {
            haptic.selection();
            press.onPressIn();
          }}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`${item.symbol} on ${CHAINS[item.chain].name}: ${amount ?? 'balance unavailable'}`}
          accessibilityHint="Opens token details"
          // Flattened: on web, Link asChild forwards style straight to <a>, which can't take arrays.
          style={StyleSheet.flatten([s.item, { backgroundColor: t.surface, borderColor: t.border }])}>
          <TokenOrb chain={item.chain} symbol={item.symbol} />
          <View style={s.flex}>
            <T variant="label">{item.symbol}</T>
            <T variant="caption">{CHAINS[item.chain].name}</T>
            {quote && <RowMarketPrice q={quote} />}
          </View>
          {amount === null ? (
            <T variant="caption" style={{ color: t.textTertiary }}>{item.error ? humanizeError(item.error).split('.')[0] : 'Unavailable'}</T>
          ) : (
            <T variant="amount">{amount} <T variant="caption">{item.symbol}</T></T>
          )}
        </Pressable>
      </Link>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 72, paddingHorizontal: Spacing.lg - 4, borderRadius: Radius.lg, borderWidth: 1 },
});
