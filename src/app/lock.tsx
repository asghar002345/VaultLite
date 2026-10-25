import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Button, Input, Screen, T } from '@/components/ui';
import { vault } from '@/vault';
import { biometricsAvailable } from '@/vault/biometrics';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Lock() {
  useSecureScreen('lock');
  const { unlockWithPin, unlockWithBiometrics, reset } = useSession();
  const [pin, setPin] = useState('');
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryBio = useCallback(async () => {
    try {
      await unlockWithBiometrics();
    } catch {
      /* user cancelled — fall back to PIN */
    }
  }, [unlockWithBiometrics]);

  useEffect(() => {
    (async () => {
      const ok = (await vault.biometricsEnabled()) && (await biometricsAvailable());
      setBio(ok);
      if (ok) tryBio();
    })();
  }, [tryBio]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPin(pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin('');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="hero">Locked</T>
      <Input testID="lock-pin" placeholder="Enter PIN" keyboardType="number-pad" secureTextEntry maxLength={6} value={pin} onChangeText={setPin} onSubmitEditing={submit} />
      {error && <T variant="error">{error}</T>}
      <Button testID="unlock" title={busy ? 'Unlocking…' : 'Unlock'} disabled={busy || pin.length !== 6} onPress={submit} />
      {bio && <Button variant="secondary" title="Use biometrics" onPress={tryBio} />}
      <Button
        variant="danger"
        title="Reset wallet"
        onPress={() =>
          Alert.alert('Reset wallet?', 'This erases the encrypted secret from this device. You need your recovery phrase to restore.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Erase', style: 'destructive', onPress: () => reset() },
          ])
        }
      />
    </Screen>
  );
}
