import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { CHAINS } from '@/config/chains';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, shortAddr } from '@/lib/format';
import type { TxRecord } from '@/store/history-core';

const ICON = { pending: '⏳', success: '✓', failed: '✗', replaced: '↺' } as const;

export function TxRow({ tx }: { tx: TxRecord }) {
  const t = useTheme();
  const title =
    tx.kind === 'cancel' ? 'Cancel' : tx.label ?? `Sent ${formatAmount(BigInt(tx.amount), tx.decimals, 4)} ${tx.symbol}`;
  return (
    <Pressable
      testID={`tx-${tx.hash}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${tx.status}, on ${CHAINS[tx.chain].name}`}
      onPress={() => router.push({ pathname: '/send/status/[hash]', params: { hash: tx.hash, chain: tx.chain } })}
      style={[s.row, { borderColor: t.border }]}>
      <T style={{ width: 24 }}>{ICON[tx.status]}</T>
      <View style={{ flex: 1 }}>
        <T>{title}{tx.kind === 'speedup' ? ' (sped up)' : ''}</T>
        <T variant="caption">
          {tx.dapp ? `${tx.dapp} · ` : ''}{CHAINS[tx.chain].name} · to {shortAddr(tx.to)} · {new Date(tx.createdAt).toLocaleString()}
        </T>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth } });
