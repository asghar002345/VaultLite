import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ConfirmSheet, EmptyState, ErrorState, LoadingState, Notice, Section } from '@/components/states';
import { Button, Card, Screen, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { humanizeError } from '@/lib/errors';

import { disconnect, disconnectAll, extendSession } from './walletkit';
import { formatConnectedAt, rememberConnectedAt, toConnectedApps, type WalletSession } from './sessions-control';
import { useSessions } from './use-sessions';

const chainName = (caip2: string) => CHAIN_LIST.find((c) => c.caip2 === caip2)?.name ?? caip2;
const storage = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

export function ConnectedAppsView({ tab, showPair, testID }: { tab?: boolean; showPair?: boolean; testID: string }) {
  const t = useTheme();
  const q = useSessions();
  const topics = q.data?.map((s) => s.topic) ?? [];
  const times = useQuery({
    queryKey: ['wc-connected-at', topics.join('|')],
    enabled: isReownConfigured() && q.isSuccess,
    queryFn: () => rememberConnectedAt(topics, storage),
  });
  const [now] = useState(() => Date.now());
  const [pending, setPending] = useState<string | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!isReownConfigured()) {
    return (
      <Screen tab={tab} testID={testID}>
        {tab ? <T variant="title">Connect</T> : null}
        <EmptyState icon="ban" title="WalletConnect not configured" body="Set EXPO_PUBLIC_REOWN_PROJECT_ID in .env (see .env.example) and rebuild to connect dApps." />
      </Screen>
    );
  }

  const sessions = (q.data ?? []) as unknown as WalletSession[];
  const apps = toConnectedApps(sessions, times.data ?? {});
  const pendingName = pending && pending !== 'all' ? apps.find((a) => a.topic === pending)?.name : null;

  const confirmDisconnect = async () => {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      if (pending === 'all') await disconnectAll();
      else await disconnect(pending);
      setPending(null);
      setNote(null);
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const onExtend = async (topic: string, name: string) => {
    setExtending(topic);
    setErr(null);
    setNote(null);
    try {
      await extendSession(topic);
      setNote(`${name} extended.`);
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setExtending(null);
    }
  };

  return (
    <Screen tab={tab} testID={testID}>
      {tab ? <T variant="title">Connect</T> : <T variant="title">Connected apps</T>}
      {showPair ? <Button testID="wc-connect" icon="plus" title="Connect a dApp" onPress={() => router.push('/walletconnect/pair')} /> : null}
      <Section title="Active sessions">
        {q.isPending && <LoadingState rows={2} label="Loading sessions" />}
        {q.isError && <ErrorState title="Couldn't start WalletConnect" error={q.error} onRetry={() => q.refetch()} />}
        {q.isSuccess && apps.length === 0 && (
          <EmptyState icon="connect" title="No connected dApps" body="Scan a WalletConnect QR code or paste a wc: link to connect." />
        )}
        {apps.map((a) => (
          <Card key={a.topic}>
            <Pressable
              testID={`wc-session-${a.topic.slice(0, 8)}`}
              accessibilityRole="button"
              accessibilityLabel={`${a.name} details`}
              onPress={() => router.push({ pathname: '/walletconnect/[topic]', params: { topic: a.topic } })}
              style={{ flexDirection: 'row', gap: Spacing.smd, alignItems: 'center' }}
            >
              {a.icon ? (
                <Image
                  source={{ uri: a.icon }}
                  accessibilityIgnoresInvertColors
                  style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: t.surfaceRaised }}
                />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: t.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="connect" />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="label">{a.name}</T>
                <T variant="caption" numberOfLines={1}>{a.url || 'No URL'}</T>
              </View>
              <Icon name="chevron" size="sm" color="textTertiary" />
            </Pressable>
            <T variant="caption">Chains: {a.chains.length ? a.chains.map(chainName).join(', ') : '—'}</T>
            <T variant="caption">
              {a.connectedAt === null ? 'Connected …' : `Connected ${formatConnectedAt(a.connectedAt, now)}`}
              {a.expiry ? ` · expires ${new Date(a.expiry * 1000).toLocaleString()}` : ''}
            </T>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`wc-extend-${a.topic.slice(0, 8)}`}
                  variant="secondary"
                  icon="refresh"
                  title="Extend"
                  loading={extending === a.topic}
                  onPress={() => onExtend(a.topic, a.name)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`wc-disconnect-${a.topic.slice(0, 8)}`}
                  variant="danger"
                  icon="disconnect"
                  title="Disconnect"
                  onPress={() => { setErr(null); setPending(a.topic); }}
                />
              </View>
            </View>
          </Card>
        ))}
      </Section>
      {apps.length > 0 ? (
        <Button testID="wc-disconnect-all" variant="ghost" icon="disconnect" title="Disconnect all" onPress={() => { setErr(null); setPending('all'); }} />
      ) : null}
      {showPair ? <Notice>Plain messages open a quick sheet; typed data and transactions open a full review screen.</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}
      {err && !pending ? <Notice tone="danger">{err}</Notice> : null}
      <ConfirmSheet
        visible={pending !== null}
        danger
        title={pending === 'all' ? 'Disconnect all apps?' : `Disconnect ${pendingName ?? 'this app'}?`}
        body={pending === 'all' ? 'Every dApp session on this device will end.' : 'The dApp will no longer be able to send requests until you reconnect.'}
        confirmLabel="Disconnect"
        busy={busy}
        error={err}
        onCancel={() => { if (!busy) { setPending(null); setErr(null); } }}
        onConfirm={confirmDisconnect}
      />
    </Screen>
  );
}
