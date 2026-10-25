import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { Button, Card, Input, Screen, T, TestnetBanner } from '@/components/ui';
import { humanizeError } from '@/lib/errors';
import { disconnect, getWalletKit, listSessions, pair, subscribe } from '@/walletconnect/walletkit';

type Session = Awaited<ReturnType<typeof listSessions>>[number];

export default function WalletConnectScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [uri, setUri] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = useCallback(() => void listSessions().then(setSessions), []);

  useEffect(() => {
    getWalletKit().then(refresh).catch((e) => setMsg(humanizeError(e)));
    return subscribe({ onSessionsChanged: refresh });
  }, [refresh]);

  return (
    <Screen>
      <TestnetBanner />
      <Button title="Scan QR code" onPress={() => router.push({ pathname: '/scan', params: { mode: 'wc' } })} />
      <T variant="caption">…or paste a wc: URI from a dApp</T>
      <Input testID="wc-uri" value={uri} onChangeText={setUri} placeholder="wc:…" />
      <Button
        title="Connect"
        disabled={!uri.startsWith('wc:')}
        onPress={() =>
          pair(uri)
            .then(() => {
              setUri('');
              setMsg('Waiting for proposal…');
            })
            .catch((e) => setMsg(humanizeError(e)))
        }
      />
      {msg && <T variant="caption">{msg}</T>}
      <T variant="title">Active sessions</T>
      {sessions.length === 0 && <T variant="caption">None</T>}
      {sessions.map((s) => (
        <Card key={s.topic}>
          <T style={{ fontWeight: '600' }}>{s.peer.metadata.name}</T>
          <T variant="caption">{s.peer.metadata.url}</T>
          <T variant="caption">{Object.values(s.namespaces).flatMap((n) => n.chains ?? []).join(', ')}</T>
          <Button variant="danger" title="Disconnect" onPress={() => disconnect(s.topic).catch((e) => setMsg(humanizeError(e)))} />
        </Card>
      ))}
    </Screen>
  );
}
