import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { Icon } from '@/components/icon';
import { ConfirmSheet, ListRow, Notice, PinField, Section } from '@/components/states';
import { Screen } from '@/components/ui';
import { AUTO_LOCK_OPTIONS, updateSettings, useSettings } from '@/store/settings';
import { biometricsAvailable as bioAvail } from '@/vault/biometrics';
import { useSession } from '@/vault/session';

export default function Security() {
  const { biometricsEnabled: readBio, setBiometrics } = useSession();
  const [biometricsEnabled, setBioOn] = useState(false);
  const [biometricsAvailable, setAvail] = useState(false);
  const [rev, setRev] = useState(0);
  useEffect(() => { readBio().then(setBioOn); bioAvail().then(setAvail); }, [readBio, rev]);
  const { autoLockMs } = useSettings();
  const [pending, setPending] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setPending(null); setPin(''); setErr(null); };
  const confirm = async () => {
    if (pending === null) return;
    setBusy(true); setErr(null);
    try { await setBiometrics(pin, pending); close(); setRev((r) => r + 1); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen testID="settings-security">
      <Section title="Unlock" group>
        <ListRow testID="row-change-pin" icon="key" title="Change PIN" subtitle="Re-encrypts the vault with a new PIN" onPress={() => router.push('/settings/security/pin')} />
        <ListRow
          icon="biometrics"
          title="Biometric unlock"
          subtitle={biometricsAvailable ? 'Use fingerprint / face to unlock' : 'Not available on this device'}
          right={<Switch testID="bio-switch" value={biometricsEnabled} disabled={!biometricsAvailable} onValueChange={(v) => setPending(v)} />}
        />
      </Section>
      <Section title="Auto-lock" group>
        {AUTO_LOCK_OPTIONS.map(({ ms, label }) => (
          <ListRow key={ms} testID={`autolock-${ms}`} icon="timer" title={label} onPress={() => updateSettings({ autoLockMs: ms })} right={autoLockMs === ms ? <Icon name="check" color="primary" /> : <></>} />
        ))}
      </Section>
      <Section title="Recovery" group>
        <ListRow testID="row-reveal" icon="show" title="Reveal recovery phrase" subtitle="Requires your PIN" danger onPress={() => router.push('/settings/security/reveal')} />
      </Section>
      <Notice>Auto-lock applies when the app goes to the background. The vault is always locked on a cold start.</Notice>
      <ConfirmSheet
        visible={pending !== null}
        title={pending ? 'Enable biometric unlock' : 'Disable biometric unlock'}
        body="Enter your PIN to confirm."
        confirmLabel={pending ? 'Enable' : 'Disable'}
        confirmDisabled={pin.length < 6}
        busy={busy}
        error={err}
        onCancel={close}
        onConfirm={confirm}
      >
        <PinField testID="bio-pin" value={pin} onChange={setPin} />
      </ConfirmSheet>
    </Screen>
  );
}
