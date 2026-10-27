import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { EmptyState, Notice, Section } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { HoldToConfirm } from '@/components/wallet';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { requestQueue, useRequestQueue, type PendingRequest } from '@/walletconnect/queue';
import { FeePreview, RequestBody, RiskList, TITLES, useRequestActions } from '@/walletconnect/signing-sheet';

function RequestView({ item }: { item: PendingRequest }) {
  useSecureScreen('wc-request');
  const decided = useRef(false);
  const done = () => {
    decided.current = true;
    requestQueue.remove(item.request.id);
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const { a, auth, err, busy, danger, approve, reject } = useRequestActions(item, done);
  // Leaving the screen without a decision rejects the request, so the dApp is never left hanging.
  const rejectRef = useRef(reject);
  useEffect(() => {
    rejectRef.current = reject;
  });
  useEffect(() => () => {
    if (!decided.current && requestQueue.get(item.request.id)) {
      decided.current = true;
      void rejectRef.current().finally(() => requestQueue.remove(item.request.id));
    }
  }, [item.request.id]);

  const queued = useRequestQueue().length;
  return (
    <Screen testID="wc-request">
      <Stack.Screen options={{ title: TITLES[a.kind] ?? 'Request' }} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Icon name="sign" color="primary" size="lg" />
        <View style={{ flex: 1 }}>
          <T variant="label">{item.peer.name}</T>
          <T variant="caption">{item.peer.url}</T>
        </View>
      </View>
      <Notice>Network: {a.chain.name} (testnet){queued > 1 ? ` · ${queued - 1} more request(s) waiting` : ''}</Notice>
      <RiskList risks={a.risks} />
      <Section title="Details">
        <RequestBody a={a} />
      </Section>
      {a.kind === 'send_tx' && (
        <Section title="Fee">
          <FeePreview a={a} />
        </Section>
      )}
      {auth.needsPin && <Input testID="wc-pin" value={auth.pin} onChangeText={auth.setPin} placeholder="PIN to approve" secureTextEntry keyboardType="number-pad" maxLength={6} />}
      {err && <Notice tone="danger">{err}</Notice>}
      {!auth.ready && !busy && <Notice tone="disabled">Enter your PIN to enable approval.</Notice>}
      {danger ? (
        <HoldToConfirm label="Hold to approve anyway" disabled={busy || !auth.ready} onConfirm={approve} ms={2500} />
      ) : (
        <Button testID="wc-approve" icon="check" title={busy ? 'Working…' : 'Approve'} disabled={busy || !auth.ready} onPress={approve} />
      )}
      <Button testID="wc-reject" variant="secondary" icon="close" title="Reject" disabled={busy} onPress={reject} />
    </Screen>
  );
}

export default function WalletConnectRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useRequestQueue();
  const item = id ? requestQueue.get(Number(id)) : undefined;
  if (!item)
    return (
      <Screen testID="wc-request-empty">
        <EmptyState icon="success" title="Nothing to approve" body="This request was already answered or expired." action={{ label: 'Connected dApps', onPress: () => router.replace('/connect') }} />
      </Screen>
    );
  return <RequestView key={item.request.id} item={item} />;
}
