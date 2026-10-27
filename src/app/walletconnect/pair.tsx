import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Field, Notice, Section, SuccessState } from '@/components/states';
import { Button, Input, Screen } from '@/components/ui';
import { isReownConfigured } from '@/config/env';
import { humanizeError } from '@/lib/errors';
import { pair, subscribe } from '@/walletconnect/walletkit';

type Phase = { k: 'idle' } | { k: 'pairing' } | { k: 'waiting' } | { k: 'connected' } | { k: 'error'; msg: string };

export default function Pair() {
  const [uri, setUri] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const valid = /^wc:[0-9a-f]+@2\?/i.test(uri.trim());

  useEffect(() => subscribe({ onSessionsChanged: () => setPhase((p) => (p.k === 'waiting' ? { k: 'connected' } : p)) }), []);

  if (phase.k === 'connected')
    return (
      <Screen testID="wc-pair-done">
        <SuccessState title="dApp connected" body="Requests from it will appear here for approval.">
          <Button title="View sessions" onPress={() => router.replace('/connect')} />
        </SuccessState>
      </Screen>
    );

  return (
    <Screen testID="wc-pair">
      {!isReownConfigured() && <Notice tone="disabled">WalletConnect is not configured (EXPO_PUBLIC_REOWN_PROJECT_ID).</Notice>}
      <Section title="Scan">
        <Button testID="wc-scan" icon="scan" title="Scan QR code" disabled={!isReownConfigured()} onPress={() => router.push({ pathname: '/scan', params: { mode: 'wc' } })} />
      </Section>
      <Section title="Or paste a link">
        <Field label="WalletConnect URI" helper="Starts with wc: — copy it from the dApp’s connect dialog" error={uri && !valid ? 'Not a WalletConnect v2 URI' : null}>
          <Input testID="wc-uri" value={uri} onChangeText={setUri} placeholder="wc:…@2?relay-protocol=irn&symKey=…" autoCapitalize="none" autoCorrect={false} />
        </Field>
        <Button
          testID="wc-pair-submit"
          icon="connect"
          title={phase.k === 'pairing' ? 'Pairing…' : 'Connect'}
          disabled={!valid || phase.k === 'pairing' || !isReownConfigured()}
          onPress={() => {
            setPhase({ k: 'pairing' });
            pair(uri.trim())
              .then(() => { setUri(''); setPhase({ k: 'waiting' }); })
              .catch((e) => setPhase({ k: 'error', msg: humanizeError(e) }));
          }}
        />
      </Section>
      {phase.k === 'waiting' && <Notice>Paired. Waiting for the dApp&apos;s connection proposal…</Notice>}
      {phase.k === 'error' && <Notice tone="danger">{phase.msg}</Notice>}
    </Screen>
  );
}
