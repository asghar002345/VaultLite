import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { privateKeyToAccount } from 'viem/accounts';

import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, ListRow, Notice, Section, SuccessState } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { HoldToConfirm } from '@/components/wallet';
import { alpha, Fonts, Radius, Spacing } from '@/constants/theme';
import { useReauth } from '@/hooks/use-reauth';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { useTheme } from '@/hooks/use-theme';
import { humanizeError } from '@/lib/errors';
import { formatAmount, shortAddr } from '@/lib/format';
import {
  BundlerRpcError,
  isSmartAccountConfigured,
  reviewBatch,
  sendBatchUserOperation,
  SMART_ACCOUNT_CONFIG,
  VaultLiteSmartAccountProvider,
  type Hex,
} from '@/modules/smartAccount';
import { clearBatchSent, markBatchSent, useBatchDraft, useBatchSent } from '@/modules/smartAccount/batch-draft';
import { publicClient } from '@/services/evm';
import { useSession } from '@/vault/session';

function providerFor(pk: Hex) {
  const cfg = SMART_ACCOUNT_CONFIG.baseSepolia;
  if (!cfg?.factory) throw new Error('Base Sepolia smart account is not configured');
  return new VaultLiteSmartAccountProvider(cfg, publicClient('baseSepolia'), privateKeyToAccount(pk), { sponsor: false });
}

function explain(e: unknown): string {
  if (e instanceof BundlerRpcError && e.hint) return e.hint;
  return humanizeError(e);
}

export default function BatchReview() {
  useSecureScreen('batch-review');
  const t = useTheme();
  const calls = useBatchDraft();
  const rows = reviewBatch(calls);
  const unlimited = rows.some((r) => r.approval?.unlimited);
  const configured = isSmartAccountConfigured(SMART_ACCOUNT_CONFIG.baseSepolia);
  const { accounts, withKeys } = useSession();
  const auth = useReauth();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useBatchSent();

  const key = calls.map((c) => `${c.to}:${(c.value ?? 0n).toString()}:${c.data ?? '0x'}`).join('|');
  const quote = useQuery({
    queryKey: ['batch-quote', key],
    enabled: configured && calls.length > 0 && !!accounts,
    queryFn: () => withKeys((k) => providerFor(k.evm).quoteSelfPaid(calls, undefined, { batch: true })),
  });

  if (sent) {
    return (
      <Screen testID="batch-review-sent">
        <SuccessState title="Batch submitted" body="One self-paid UserOperation was sent through the bundler proxy.">
          <T variant="mono" selectable>{sent}</T>
          <Button
            title="Done"
            onPress={() => {
              clearBatchSent();
              router.replace('/settings/smart-account');
            }}
          />
        </SuccessState>
      </Screen>
    );
  }

  if (calls.length === 0) {
    return (
      <Screen testID="batch-review-empty">
        <EmptyState icon="send" title="Nothing to review" body="Add at least one call to the batch." action={{ label: 'Add calls', onPress: () => router.replace('/smart-account/batch') }} />
      </Screen>
    );
  }

  const confirm = async () => {
    setError(null);
    const authErr = await auth.verify();
    if (authErr) return setError(authErr);
    try {
      const { userOpHash } = await withKeys((k) => sendBatchUserOperation(providerFor(k.evm), calls));
      markBatchSent(userOpHash);
    } catch (e) {
      setError(explain(e));
    }
  };

  const fee = quote.data;
  return (
    <Screen testID="batch-review">
      <T variant="title">Review batch</T>
      <T variant="caption">{calls.length} call{calls.length === 1 ? '' : 's'} · one UserOp · Base Sepolia</T>
      {unlimited ? (
        <View testID="batch-unlimited-warn" accessibilityRole="alert" style={{ borderRadius: Radius.lg, borderWidth: 1, borderColor: alpha(t.danger, 0.6), backgroundColor: alpha(t.danger, 0.1), padding: Spacing.lg, gap: Spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'center' }}>
            <Icon name="danger" tint={t.danger} size="lg" />
            <T variant="title" style={{ flex: 1, fontSize: 24, lineHeight: 30 }}>Unlimited approval</T>
          </View>
          <T>A spender in this batch can move the entire token balance, now and later.</T>
        </View>
      ) : null}
      <Section title="Calls" group>
        {rows.map((r) => (
          <View key={r.index}>
            <ListRow
              testID={`batch-review-${r.index}`}
              icon={r.approval ? 'key' : 'send'}
              title={`${r.index + 1}. ${r.title}`}
              subtitle={shortAddr(r.to)}
              value={r.approval ? r.approval.amountLabel : r.value > 0n ? `${r.value.toString()} wei` : undefined}
              danger={!!r.warning}
            />
            {r.approval ? (
              <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 2 }}>
                <T variant="caption">Spender {r.approval.spender}</T>
                <T variant="caption">Amount {r.approval.amountLabel}</T>
              </View>
            ) : (
              <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
                <T variant="caption">{r.detail}</T>
              </View>
            )}
            {r.warning ? <Notice tone="danger">{r.warning}</Notice> : null}
          </View>
        ))}
      </Section>
      <Section title="Gas · self-paid">
        <Notice>No paymaster policy covers this batch. The proxy returns not_sponsorable, so the smart account pays its own gas.</Notice>
        {!configured && <Notice tone="disabled">Bundler not configured. Set EXPO_PUBLIC_BUNDLER_PROXY_URL to send.</Notice>}
        {quote.isPending && configured ? <T variant="caption">Estimating gas…</T> : null}
        {quote.isError ? <ErrorState title="Gas estimate failed" error={quote.error} onRetry={() => quote.refetch()} /> : null}
        {fee ? (
          <View style={{ gap: Spacing.xs }}>
            <T variant="amount">Up to {formatAmount(fee.maxCostWei, 18, 8)} ETH</T>
            <T variant="caption" style={{ fontFamily: Fonts.mono }}>
              gas {fee.totalGas.toString()} · max fee {fee.price.maxFeePerGas.toString()} wei
            </T>
          </View>
        ) : null}
      </Section>
      {unlimited ? (
        <Pressable testID="batch-ack" accessibilityRole="checkbox" accessibilityState={{ checked: ack }} onPress={() => setAck((v) => !v)} style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'flex-start', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: ack ? t.danger : t.border, backgroundColor: ack ? t.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {ack ? <Icon name="check" size="sm" tint={t.onDanger} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <T variant="label">I understand the unlimited approval</T>
            <T variant="caption">The spender can pull the full balance of this token.</T>
          </View>
        </Pressable>
      ) : null}
      {auth.needsPin ? (
        <Input testID="pin" value={auth.pin} onChangeText={auth.setPin} placeholder="PIN to confirm" secureTextEntry keyboardType="number-pad" maxLength={6} />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <HoldToConfirm
        danger={unlimited}
        label={unlimited ? 'Hold to send anyway' : 'Hold to send batch'}
        disabled={!configured || !quote.isSuccess || !auth.ready || (unlimited && !ack)}
        onConfirm={confirm}
      />
      <Button variant="ghost" title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/smart-account/batch'))} />
    </Screen>
  );
}
