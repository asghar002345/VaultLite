import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
  type Mode = 'evm' | 'tron' | 'solana';
  const [mode, setMode] = useState<Mode>(params.chain === 'tronNile' ? 'tron' : params.chain === 'solanaDevnet' ? 'solana' : 'evm');
  const tron = mode === 'tron';
  const [copied, setCopied] = useState(false);
  if (!accounts) return null;
  const address = mode === 'tron' ? accounts.tron.address : mode === 'solana' ? accounts.solana.address : accounts.evm.address;
  const label =
    mode === 'tron' ? CHAINS.tronNile.name : mode === 'solana' ? CHAINS.solanaDevnet.name : params.chain && params.chain in CHAINS ? CHAINS[params.chain as ChainKey].name : 'any EVM testnet';
  return (
    <Screen>
      <TestnetBanner />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="EVM" active={mode === 'evm'} onPress={() => setMode('evm')} />
        <Chip label="Tron Nile" active={mode === 'tron'} onPress={() => setMode('tron')} />
        <Chip label="Solana Devnet" active={mode === 'solana'} onPress={() => setMode('solana')} />
      </View>
      {!address && <T variant="caption">{accounts.solana.note}</T>}
      {address && (<>
      <Card>
        <View accessible accessibilityLabel={`QR code for ${label} address`} style={{ alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
          <QRCode value={address} size={220} />
        </View>
        <T variant="caption">Your address on {label}</T>
        <T variant="mono" selectable testID="receive-address">{address}</T>
      </Card>
      <T variant="caption">Only send testnet assets. {tron ? 'TRX / TRC-20 on Nile only.' : mode === 'solana' ? 'Devnet SOL only (get some at faucet.solana.com).' : 'Same address on Sepolia, Amoy, BSC Testnet and Base Sepolia.'}</T>
      <Button
        title={copied ? 'Copied ✓' : 'Copy address'}
        onPress={async () => {
          await Clipboard.setStringAsync(address);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />
      <Button variant="secondary" title="Share" onPress={() => Share.share({ message: address })} />
      </>)}
    </Screen>
  );
}
