import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { EmptyState, LoadingState, Notice } from '@/components/states';
import { Button, Screen, T } from '@/components/ui';
import { humanizeError } from '@/lib/errors';
import { parseScan } from '@/lib/scan';
import { putScan } from '@/lib/scan-bus';
import { pair } from '@/walletconnect/walletkit';

/** mode=address → hands an address back to /send; mode=wc → pairs a WalletConnect URI; mode=any (Home) → routes to Send or WalletConnect. */
export default function Scan() {
  const { mode = 'address' } = useLocalSearchParams<{ mode?: 'address' | 'wc' | 'any' }>();
  const [perm, request] = useCameraPermissions();
  const [msg, setMsg] = useState<string | null>(null);
  const busy = useRef(false);

  if (!perm) return <Screen><LoadingState rows={1} label="Checking camera permission" /></Screen>;
  if (!perm.granted) {
    return (
      <Screen>
        <EmptyState icon="scan" title="Camera access" body={`VaultLite needs the camera to scan ${mode === 'wc' ? 'WalletConnect' : mode === 'any' ? 'address or WalletConnect' : 'address'} QR codes. Nothing is recorded.`} />
        {perm.canAskAgain ? <Button title="Allow camera" icon="scan" onPress={request} /> : <Notice tone="danger">Permission denied — enable it in system settings.</Notice>}
        <Button variant="secondary" title="Cancel" onPress={() => router.back()} />
      </Screen>
    );
  }

  const onScan = async ({ data }: { data: string }) => {
    if (busy.current) return;
    busy.current = true;
    const r = parseScan(data);
    if (mode === 'any' && r.kind !== 'unknown') {
      try {
        if (r.kind === 'wc') {
          await pair(r.uri);
          router.replace('/walletconnect');
        } else {
          putScan(r);
          router.replace('/send');
        }
        return;
      } catch (e) {
        setMsg(humanizeError(e));
      }
    } else if (mode === 'wc') {
      if (r.kind !== 'wc') {
        setMsg(r.kind === 'unknown' ? r.reason : 'That is an address, not a WalletConnect code');
      } else {
        try {
          await pair(r.uri);
          router.back();
          return;
        } catch (e) {
          setMsg(humanizeError(e));
        }
      }
    } else if (r.kind === 'address') {
      putScan(r);
      router.back();
      return;
    } else {
      setMsg(r.kind === 'wc' ? 'That is a WalletConnect code — open WalletConnect to use it' : r.reason);
    }
    setTimeout(() => (busy.current = false), 1500);
  };

  return (
    <View style={s.flex}>
      <CameraView style={s.flex} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      <View style={s.overlay}>
        <T style={s.white}>{mode === 'wc' ? 'Scan a WalletConnect QR' : mode === 'any' ? 'Scan an address or WalletConnect QR' : 'Scan an address QR'}</T>
        {msg && <Notice tone="danger">{msg}</Notice>}
        <Button variant="secondary" title="Cancel" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 48, gap: 12 },
  white: { color: Colors.dark.text, textAlign: 'center', fontWeight: '700' },
});
