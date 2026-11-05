import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ConfirmSheet, ListRow, Section } from '@/components/states';
import { Button, Screen, T, TestnetBanner } from '@/components/ui';
import { isReownConfigured } from '@/config/env';
import { Spacing } from '@/constants/theme';
import { autoLockLabel, useSettings } from '@/store/settings';
import { useSession } from '@/vault/session';
import { useSessions } from '@/walletconnect/use-sessions';

export default function SettingsHub() {
  const { lock, reset, biometricsEnabled } = useSession();
  const st = useSettings();
  const wc = useSessions();
  const [bio, setBio] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    biometricsEnabled().then(setBio);
  }, [biometricsEnabled]);
  const sessions = wc.data?.length ?? 0;
  return (
    <Screen tab testID="settings-hub">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="title">Settings</T>
        <TestnetBanner />
      </View>
      <Section title="Security" group>
        <ListRow testID="row-security" icon="biometrics" title="Biometric unlock" value={bio === null ? '…' : bio ? 'On' : 'Off'} onPress={() => router.push('/settings/security')} />
        <ListRow testID="row-change-pin-hub" icon="key" title="Change PIN" value="••••••" onPress={() => router.push('/settings/security/pin')} />
        <ListRow testID="row-autolock" icon="timer" title="Auto-lock" value={autoLockLabel(st.autoLockMs)} onPress={() => router.push('/settings/security')} />
      </Section>
      <Section title="Backup & recovery" group>
        <ListRow testID="row-reveal-hub" icon="warning" title="Recovery phrase" subtitle="Reveal after entering your PIN" onPress={() => router.push('/settings/security/reveal')} />
      </Section>
      <Section title="Connections" group>
        <ListRow testID="row-wc" icon="connect" title="Connected apps" value={!isReownConfigured() ? 'Not configured' : wc.isSuccess ? `${sessions} active` : '…'} onPress={() => router.navigate('/connect')} />
      </Section>
      <Section title="Networks & assets" group>
        <ListRow testID="row-networks" icon="network" title="Networks" value={st.hiddenChains.length ? `${st.hiddenChains.length} hidden` : 'All shown'} onPress={() => router.push('/settings/networks')} />
        <ListRow icon="plus" title="Custom tokens" subtitle="Import an ERC-20 / TRC-20 by address" onPress={() => router.push('/tokens/add')} />
        <ListRow testID="row-escrow" icon="escrow" title="Milestone escrow" subtitle="Base Sepolia · USDC" onPress={() => router.push('/escrow')} />
      </Section>
      <Section title="App" group>
        <ListRow testID="row-appearance" icon="moon" title="Appearance" value="Vault Dark" onPress={() => router.push('/settings/appearance')} />
        <ListRow testID="row-currency" icon="currency" title="Currency" value="USDT" onPress={() => router.push('/settings/currency')} />
        <ListRow testID="row-about" icon="info" title="About" value={`v${Constants.expoConfig?.version ?? 'dev'}`} onPress={() => router.push('/settings/about')} />
      </Section>
      <View style={{ gap: Spacing.sm }}>
        <Button testID="settings-lock" variant="secondary" icon="lock" title="Lock wallet" onPress={lock} />
        <Button testID="row-reset" variant="ghost" icon="trash" title="Reset wallet" onPress={() => setConfirmReset(true)} />
      </View>
      <ConfirmSheet
        visible={confirmReset}
        danger
        title="Reset wallet?"
        body="This erases the encrypted wallet from this device. You will need your recovery phrase to restore it. Testnet funds on-chain are not affected."
        confirmLabel="Erase wallet"
        busy={busy}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setBusy(true);
          await reset();
          setBusy(false);
          setConfirmReset(false);
        }}
      />
    </Screen>
  );
}
