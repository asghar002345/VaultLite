import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Guilloche } from '@/components/fx/guilloche';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic, useMotion } from '@/motion';
import QRCode from 'react-native-qrcode-svg';

import { EmptyState, Notice } from '@/components/states';
import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { SegmentedPills } from '@/components/wallet';
import { CHAINS, type ChainKey } from '@/config/chains';
import { useSession } from '@/vault/session';

export default function Receive() {
  const t = useTheme();
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
    <Screen testID="receive">
      <TestnetBanner />
      <SegmentedPills<Mode>
        items={[{ key: 'evm', label: 'EVM' }, { key: 'tron', label: 'Tron Nile' }, { key: 'solana', label: 'Solana Devnet' }]}
        value={mode}
        onChange={setMode}
      />
      {!address && <EmptyState icon="ban" title="No Solana address" body={accounts.solana.note} />}
      {address && (<>
      <Animated.View key={mode} entering={m.pop()}>
      <Card style={{ overflow: 'hidden', alignItems: 'center', gap: Spacing.md }}>
        <Guilloche />
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between' }}>
          <T variant="overline">Your address</T>
          <T variant="overline" style={{ color: t.textTertiary }}>{label}</T>
        </View>
        <View accessible accessibilityLabel={`QR code for ${label} address`} style={{ padding: Spacing.md, backgroundColor: t.qrPaper, borderRadius: Radius.md }}>
          <QRCode value={address} size={200} color={t.qrInk} backgroundColor={t.qrPaper} />
        </View>
        <View style={{ alignSelf: 'stretch', padding: Spacing.md, borderRadius: Radius.md, backgroundColor: t.background, borderWidth: 1, borderColor: t.border }}>
          <T variant="mono" selectable testID="receive-address" style={{ textAlign: 'center' }}>{address}</T>
        </View>
      </Card>
      </Animated.View>
      <View style={{ flexDirection: 'row', gap: Spacing.smd }}>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            icon={copied ? 'check' : 'copy'}
            title={copied ? 'Copied' : 'Copy'}
            onPress={async () => {
              await Clipboard.setStringAsync(address);
              haptic.success();
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" icon="share" title="Share" onPress={() => Share.share({ message: address })} />
        </View>
      </View>
      <Notice>Only send testnet assets. {tron ? 'TRX / TRC-20 on Nile only.' : mode === 'solana' ? 'Devnet SOL only (get some at faucet.solana.com).' : 'Same address on Sepolia, Amoy, BSC Testnet and Base Sepolia.'}</Notice>
      </>)}
    </Screen>
  );
}
