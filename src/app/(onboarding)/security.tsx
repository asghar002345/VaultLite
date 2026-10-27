import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Notice } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { biometricsAvailable } from '@/vault/biometrics';
import { isValidPin } from '@/vault/vault';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Security() {
  useSecureScreen('security');
  const { pending, createVault } = useSession();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [bioAvail, setBioAvail] = useState(false);
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    biometricsAvailable().then((a) => {
      setBioAvail(a);
      setBio(a);
    });
  }, []);

  if (!pending) return <Redirect href="/welcome" />;

  const save = async () => {
    if (!isValidPin(pin)) return setError('PIN must be exactly 6 digits.');
    if (pin !== confirm) return setError('PINs do not match.');
    setBusy(true);
    try {
      await createVault(pin, bio && bioAvail); // guard flips to (tabs) on success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title">Secure your wallet</T>
      <T variant="caption">Your PIN encrypts the recovery secret on this device. It cannot be recovered.</T>
      <Input testID="pin" placeholder="6-digit PIN" keyboardType="number-pad" secureTextEntry maxLength={6} value={pin} onChangeText={setPin} />
      <Input testID="pin-confirm" placeholder="Confirm PIN" keyboardType="number-pad" secureTextEntry maxLength={6} value={confirm} onChangeText={setConfirm} />
      <View style={styles.row}>
        <T>Unlock with biometrics{bioAvail ? '' : ' (unavailable)'}</T>
        <Switch accessibilityLabel="Unlock with biometrics" testID="bio-switch" value={bio} onValueChange={setBio} disabled={!bioAvail} />
      </View>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button testID="create-vault" title={busy ? 'Encrypting…' : 'Create vault'} disabled={busy} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
