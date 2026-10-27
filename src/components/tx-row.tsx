import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { CHAINS } from '@/config/chains';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, shortAddr } from '@/lib/format';
import type { TxRecord } from '@/store/history-core';

const ICON = { pending: '◌', success: '✓', failed: '✕', replaced: '↺' } as const;

export function TxRow({ tx }: { tx: TxRecord }) {
  const t = useTheme();
  const title =
    tx.kind === 'cancel' ? 'Cancel' : tx.label ?? `Sent ${formatAmount(BigInt(tx.amount), tx.decimals, 4)} ${tx.symbol}`;
  const color = { pending: t.warning, success: t.success, failed: t.danger, replaced: t.textSecondary }[tx.status];
  return (
    <Pressable
      testID={`tx-${tx.hash}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${tx.status}, on ${CHAINS[tx.chain].name}`}
      onPress={() => router.push({ pathname: '/send/status/[hash]', params: { hash: tx.hash, chain: tx.chain } })}
      style={[s.row, { borderColor: t.border, backgroundColor: t.surface }]}>
      <View style={[s.badge, { backgroundColor: color + '22' }]}>
        <T style={{ color }}>{ICON[tx.status]}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="label">{title}{tx.kind === 'speedup' ? ' (sped up)' : ''}</T>
        <T variant="caption">
          {tx.dapp ? `${tx.dapp} · ` : ''}{CHAINS[tx.chain].name} · to {shortAddr(tx.to)} · {new Date(tx.createdAt).toLocaleString()}
        </T>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4, padding: 12, borderRadius: Radius.lg, borderWidth: 1, marginBottom: 8 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
