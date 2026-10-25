import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { Chip } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { useSession } from '@/vault/session';

export default function Receive() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const { accounts } = useSession();
  const [tron, setTron] = useState(params.chain === 'tronNile');
  const [copied, setCopied] = useState(false);
  if (!accounts) return null;
  const address = tron ? accounts.tron.address : accounts.evm.address;
  const label = tron ? CHAINS.tronNile.name : params.chain && params.chain in CHAINS ? CHAINS[params.chain as ChainKey].name : 'any EVM testnet';
  return (
    <Screen>
      <TestnetBanner />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="EVM" active={!tron} onPress={() => setTron(false)} />
        <Chip label="Tron Nile" active={tron} onPress={() => setTron(true)} />
      </View>
      <Card>
        <View style={{ alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
          <QRCode value={address} size={220} />
        </View>
        <T variant="caption">Your address on {label}</T>
        <T variant="mono" selectable testID="receive-address">{address}</T>
      </Card>
      <T variant="caption">Only send testnet assets. {tron ? 'TRX / TRC-20 on Nile only.' : 'Same address on Sepolia, Amoy, BSC Testnet and Base Sepolia.'}</T>
      <Button
        title={copied ? 'Copied ✓' : 'Copy address'}
        onPress={async () => {
          await Clipboard.setStringAsync(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />
      <Button variant="secondary" title="Share" onPress={() => Share.share({ message: address })} />
    </Screen>
  );
}
