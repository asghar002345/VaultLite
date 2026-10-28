import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Monogram } from '@/components/brand';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { Guilloche } from '@/components/fx/guilloche';
import { Icon, type IconName } from '@/components/icon';
import { useBreakpoint, useTabInset } from '@/components/layout';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/states';
import { previewRows, TokenRow } from '@/components/token-row';
import { TxRow } from '@/components/tx-row';
import { T, TestnetBanner, usePressScale } from '@/components/ui';
import { Fonts, Layout, Radius, Spacing, Tabular, TextRoles } from '@/constants/theme';
import { useBalances } from '@/hooks/use-balances';
import { useTheme } from '@/hooks/use-theme';
import { stableTotal } from '@/lib/amount';
import { haptic } from '@/motion';
import { useHistory } from '@/store/history';
import { useSettings } from '@/store/settings';
import { useSession } from '@/vault/session';
import Animated from 'react-native-reanimated';

const ACTIONS: { key: string; label: string; icon: IconName; href: '/send' | '/receive' | '/escrow' }[] = [
  { key: 'send', label: 'Send', icon: 'send', href: '/send' },
  { key: 'receive', label: 'Receive', icon: 'receive', href: '/receive' },
  { key: 'escrow', label: 'Escrow', icon: 'escrow', href: '/escrow' },
];

function QuickAction({ a }: { a: (typeof ACTIONS)[number] }) {
  const t = useTheme();
  const press = usePressScale(0.97);
  return (
    <Animated.View style={[s.flex, press.style]}>
      <Pressable
        testID={`qa-${a.key}`}
        accessibilityRole="button"
        accessibilityLabel={a.label}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          haptic.light();
          router.push(a.href);
        }}
        style={[s.qa, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={[s.qaIcon, { backgroundColor: t.surfaceRaised }]}>
          <Icon name={a.icon} tint={t.primary} />
        </View>
        <T variant="overline" style={{ color: t.textSecondary }}>{a.label}</T>
      </Pressable>
    </Animated.View>
  );
}

export default function Home() {
  const t = useTheme();
  const { accounts } = useSession();
  const q = useBalances();
  const history = useHistory(accounts ? { evm: accounts.evm.address, tron: accounts.tron.address } : undefined);
  const qc = useQueryClient();
  const { hiddenChains } = useSettings();
  const bp = useBreakpoint();
  const tabInset = useTabInset();
  const visible = useMemo(() => (q.data ?? []).filter((x) => !hiddenChains.includes(x.chain)), [q.data, hiddenChains]);
  const preview = useMemo(() => previewRows(visible, 4), [visible]);
  if (!accounts) return null;
  const total = stableTotal(visible);
  const pad = bp.compact ? Spacing.md : Layout.margin;

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: t.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        testID="home"
        contentContainerStyle={[s.pad, { paddingHorizontal: pad, paddingBottom: tabInset, maxWidth: Layout.maxContent, width: '100%', alignSelf: 'center' }]}
        refreshControl={
          <RefreshControl
            tintColor={t.primary}
            refreshing={q.isRefetching}
            onRefresh={() => {
              haptic.light();
              qc.invalidateQueries({ queryKey: ['balances'] });
              qc.invalidateQueries({ queryKey: ['history'] });
            }}
          />
        }>
        <View style={s.topRow}>
          <View style={s.brand}>
            <Monogram size={32} />
            <T style={{ fontFamily: Fonts.display, fontSize: 24, lineHeight: 28, color: t.text }}>VaultLite</T>
            <TestnetBanner />
          </View>
          <Pressable testID="home-scan" accessibilityRole="button" accessibilityLabel="Scan QR code" hitSlop={12} onPress={() => router.push({ pathname: '/scan', params: { mode: 'any' } })} style={[s.iconBtn, { borderColor: t.border }]}>
            <Icon name="scan" size="sm" color="textSecondary" />
          </Pressable>
        </View>

        <View style={[s.hero, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Guilloche />
          <T variant="overline">Total · test stablecoins at $1</T>
          <AnimatedNumber
            testID="total"
            accessibilityLabel={`Total ${total.toFixed(2)} test dollars`}
            value={total}
            prefix="$"
            style={[TextRoles.displayNumber, { color: t.text }, Tabular]}
          />
          <T variant="mono" style={{ color: t.textTertiary }}>
            {accounts.evm.address.slice(0, 6)}…{accounts.evm.address.slice(-4)}
          </T>
        </View>

        <View style={s.row}>
          {ACTIONS.map((a) => (
            <QuickAction key={a.key} a={a} />
          ))}
        </View>

        {history.pending.length > 0 && (
          <Section title="Pending">
            <View testID="pending-list" style={{ gap: Spacing.sm }}>
              {history.pending.map((tx) => (
                <TxRow key={tx.hash} tx={tx} />
              ))}
            </View>
          </Section>
        )}

        <Section
          title="Assets"
          right={
            <Pressable testID="view-all" accessibilityRole="link" hitSlop={10} onPress={() => router.push('/tokens')}>
              <T variant="overline" style={{ color: t.primary }}>View all{q.data ? ` (${visible.length})` : ''}</T>
            </Pressable>
          }>
          {q.isPending && <LoadingState rows={4} height={72} label="Loading balances" />}
          {q.isError && <ErrorState title="Couldn't load balances" error={q.error} onRetry={() => q.refetch()} />}
          {q.isSuccess && preview.length === 0 && (
            <EmptyState icon="wallet" title="No networks shown" body="All networks are hidden. Show them again in Settings → Networks." action={{ label: 'Networks', onPress: () => router.push('/settings/networks') }} />
          )}
          <View style={{ gap: Spacing.sm }}>
            {preview.map((item, i) => (
              <TokenRow key={`${item.chain}:${item.address}`} item={item} index={i} />
            ))}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingTop: Spacing.md, gap: Spacing.xl },
  row: { flexDirection: 'row', gap: Spacing.smd },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.smd },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm, overflow: 'hidden', minHeight: 176, justifyContent: 'center' },
  qa: { borderRadius: Radius.lg, borderWidth: 1, paddingVertical: Spacing.lg, alignItems: 'center', gap: Spacing.smd },
  qaIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
