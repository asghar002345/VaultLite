import { router } from 'expo-router';
import { useState } from 'react';

import { ConfirmSheet, ListRow, Section } from '@/components/states';
import { Screen, T, TestnetBanner } from '@/components/ui';
import { isReownConfigured } from '@/config/env';
import { useSettings, autoLockLabel } from '@/store/settings';
import { useSession } from '@/vault/session';

export default function SettingsHub() {
  const { lock, reset } = useSession();
  const st = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Screen tab testID="settings-hub">
      <T variant="title">Settings</T>
      <TestnetBanner />
      <Section title="Security">
        <ListRow testID="row-security" icon="shield" title="Security" subtitle={`PIN, biometrics, recovery phrase · auto-lock ${autoLockLabel(st.autoLockMs).toLowerCase()}`} onPress={() => router.push('/settings/security')} />
      </Section>
      <Section title="Wallet">
        <ListRow testID="row-networks" icon="network" title="Networks" subtitle={st.hiddenChains.length ? `${st.hiddenChains.length} hidden on Home` : 'All testnets shown'} onPress={() => router.push('/settings/networks')} />
        <ListRow icon="plus" title="Custom tokens" subtitle="Import an ERC-20 / TRC-20 by address" onPress={() => router.push('/tokens/add')} />
        <ListRow testID="row-wc" icon="connect" title="Connected dApps" subtitle={isReownConfigured() ? 'WalletConnect sessions' : 'WalletConnect not configured'} onPress={() => router.push('/walletconnect')} />
      </Section>
      <Section title="Preferences">
        <ListRow testID="row-appearance" icon="palette" title="Appearance" value="Vault Dark" onPress={() => router.push('/settings/appearance')} />
        <ListRow testID="row-currency" icon="currency" title="Currency" value="USD" onPress={() => router.push('/settings/currency')} />
      </Section>
      <Section title="App">
        <ListRow testID="row-about" icon="info" title="About VaultLite" onPress={() => router.push('/settings/about')} />
        <ListRow icon="lock" title="Lock now" onPress={lock} />
        <ListRow testID="row-reset" icon="trash" title="Reset wallet" subtitle="Erase this wallet from the device" danger onPress={() => setConfirmReset(true)} />
      </Section>
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
