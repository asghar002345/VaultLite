import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import { ListRow, Notice, Section } from '@/components/states';
import { Screen, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { getEscrowAddress } from '@/modules/escrow';

export default function About() {
  const version = Constants.expoConfig?.version ?? 'dev';
  const escrow = getEscrowAddress('baseSepolia');
  return (
    <Screen testID="settings-about">
      <T variant="title">VaultLite</T>
      <T variant="caption">Version {version} · self-custodial multi-chain wallet demo</T>
      <Notice tone="warning">Testnets only. Keys are encrypted on this device with your PIN (scrypt + XChaCha20-Poly1305) and never leave it.</Notice>
      <Section title="Networks">
        <T variant="caption">{CHAIN_LIST.map((c) => c.name).join(' · ')}</T>
      </Section>
      <Section title="Integrations">
        <ListRow icon="connect" title="WalletConnect (Reown)" value={isReownConfigured() ? 'Configured' : 'Not configured'} />
        {escrow ? (
          <ListRow icon="escrow" title="MilestoneEscrow (Base Sepolia)" subtitle={escrow} onPress={() => WebBrowser.openBrowserAsync(`https://repo.sourcify.dev/84532/${escrow}`)} />
        ) : null}
      </Section>
    </Screen>
  );
}
