import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Aurora } from '@/components/fx/skia';
import { Radius } from '@/constants/theme';
import { haptic, useMotion } from '@/motion';
import QRCode from 'react-native-qrcode-svg';

import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { SegmentedPills } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { useSession } from '@/vault/session';

export default function Receive() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const { accounts } = useSession();
  type Mode = 'evm' | 'tron' | 'solana';
  const [mode, setMode] = useState<Mode>(params.chain === 'tronNile' ? 'tron' : params.chain === 'solanaDevnet' ? 'solana' : 'evm');
  const tron = mode === 'tron';
  const [copied, setCopied] = useState(false);
  const m = useMotion();
  if (!accounts) return null;
  const address = mode === 'tron' ? accounts.tron.address : mode === 'solana' ? accounts.solana.address : accounts.evm.address;
  const label =
    mode === 'tron' ? CHAINS.tronNile.name : mode === 'solana' ? CHAINS.solanaDevnet.name : params.chain && params.chain in CHAINS ? CHAINS[params.chain as ChainKey].name : 'any EVM testnet';
  return (
    <Screen>
      <TestnetBanner />
      <SegmentedPills<Mode>
        items={[{ key: 'evm', label: 'EVM' }, { key: 'tron', label: 'Tron Nile' }, { key: 'solana', label: 'Solana Devnet' }]}
        value={mode}
        onChange={setMode}
      />
      {!address && <T variant="caption">{accounts.solana.note}</T>}
      {address && (<>
      <Animated.View key={mode} entering={m.pop()}>
      <Card style={{ overflow: 'hidden', alignItems: 'stretch' }}>
        <Aurora intensity={0.9} />
        <View accessible accessibilityLabel={`QR code for ${label} address`} style={{ alignItems: 'center', padding: 18, backgroundColor: '#F6F3EC', borderRadius: Radius.lg, alignSelf: 'center' }}>
          <QRCode value={address} size={210} color="#07080C" backgroundColor="#F6F3EC" />
        </View>
        <T variant="caption">Your address on {label}</T>
        <T variant="mono" selectable testID="receive-address">{address}</T>
      </Card>
      </Animated.View>
      <T variant="caption">Only send testnet assets. {tron ? 'TRX / TRC-20 on Nile only.' : mode === 'solana' ? 'Devnet SOL only (get some at faucet.solana.com).' : 'Same address on Sepolia, Amoy, BSC Testnet and Base Sepolia.'}</T>
      <Button
        title={copied ? 'Copied ✓' : 'Copy address'}
        onPress={async () => {
          await Clipboard.setStringAsync(address);
          haptic.success();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />
      <Button variant="secondary" title="Share" onPress={() => Share.share({ message: address })} />
      </>)}
    </Screen>
  );
}
