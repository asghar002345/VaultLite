import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ConfirmSheet, EmptyState, ErrorState, ListRow, LoadingState, Section } from '@/components/states';
import { Button, Card, Screen, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { humanizeError } from '@/lib/errors';
import { disconnect } from '@/walletconnect/walletkit';

import { useSessions } from '@/walletconnect/use-sessions';

const chainName = (caip2: string) => CHAIN_LIST.find((c) => c.caip2 === caip2)?.name ?? caip2;

export default function SessionDetail() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const q = useSessions();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = q.data?.find((x) => x.topic === topic);

  if (q.isPending) return <Screen><LoadingState rows={3} /></Screen>;
  if (q.isError) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!s)
    return (
      <Screen testID="wc-session-missing">
        <EmptyState icon="disconnect" title="Session ended" body="This dApp is no longer connected." action={{ label: 'All sessions', onPress: () => router.replace('/connect') }} />
      </Screen>
    );

  const ns = Object.entries(s.namespaces);
  return (
    <Screen testID="wc-session">
      <Stack.Screen options={{ title: s.peer.metadata.name || 'Session' }} />
      <Card>
        <T variant="title">{s.peer.metadata.name}</T>
        <T variant="caption">{s.peer.metadata.url}</T>
        {s.peer.metadata.description ? <T variant="caption">{s.peer.metadata.description}</T> : null}
        <T variant="caption">Expires {new Date(s.expiry * 1000).toLocaleString()}</T>
      </Card>
      {ns.map(([key, n]) => (
        <Section key={key} title={key.toUpperCase()}>
          {(n.chains ?? []).map((c) => <ListRow key={c} icon="network" title={chainName(c)} subtitle={c} />)}
          {n.accounts.map((acc) => <T key={acc} variant="mono" selectable>{acc.split(':').slice(2).join(':')}</T>)}
          <T variant="caption">Methods: {n.methods.join(', ') || '—'}</T>
        </Section>
      ))}
      <Button testID="wc-disconnect" variant="danger" icon="disconnect" title="Disconnect" onPress={() => setConfirm(true)} />
      <ConfirmSheet
        visible={confirm}
        danger
        title={`Disconnect ${s.peer.metadata.name}?`}
        body="The dApp will no longer be able to send requests until you reconnect."
        confirmLabel="Disconnect"
        busy={busy}
        error={err}
        onCancel={() => { setConfirm(false); setErr(null); }}
        onConfirm={async () => {
          setBusy(true); setErr(null);
          try { await disconnect(s.topic); setConfirm(false); router.replace('/connect'); }
          catch (e) { setErr(humanizeError(e)); }
          finally { setBusy(false); }
        }}
      />
    </Screen>
  );
}
