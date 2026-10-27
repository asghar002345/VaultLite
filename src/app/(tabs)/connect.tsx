import { router } from 'expo-router';

import { EmptyState, ErrorState, ListRow, LoadingState, Notice, Section } from '@/components/states';
import { Button, Screen, T } from '@/components/ui';
import { isReownConfigured } from '@/config/env';
import { useSessions } from '@/walletconnect/use-sessions';

export default function WalletConnectSessions() {
  const q = useSessions();
  if (!isReownConfigured())
    return (
      <Screen tab testID="wc-sessions">
        <T variant="title">Connect</T>
        <EmptyState icon="ban" title="WalletConnect not configured" body="Set EXPO_PUBLIC_REOWN_PROJECT_ID in .env (see .env.example) and rebuild to connect dApps." />
      </Screen>
    );
  return (
    <Screen tab testID="wc-sessions">
      <T variant="title">Connect</T>
      <Button testID="wc-connect" icon="plus" title="Connect a dApp" onPress={() => router.push('/walletconnect/pair')} />
      <Section title="Active sessions" group={!!q.data?.length}>
        {q.isPending && <LoadingState rows={2} label="Loading sessions" />}
        {q.isError && <ErrorState title="Couldn't start WalletConnect" error={q.error} onRetry={() => q.refetch()} />}
        {q.isSuccess && q.data.length === 0 && (
          <EmptyState icon="connect" title="No connected dApps" body="Scan a WalletConnect QR code or paste a wc: link to connect." />
        )}
        {q.data?.map((s) => (
          <ListRow
            key={s.topic}
            testID={`wc-session-${s.topic.slice(0, 8)}`}
            icon="connect"
            title={s.peer.metadata.name || 'Unnamed dApp'}
            subtitle={`${s.peer.metadata.url} · ${Object.values(s.namespaces).flatMap((n) => n.chains ?? []).length} chain(s)`}
            onPress={() => router.push({ pathname: '/walletconnect/[topic]', params: { topic: s.topic } })}
          />
        ))}
      </Section>
      <Notice>Plain messages open a quick sheet; typed data and transactions open a full review screen.</Notice>
    </Screen>
  );
}
