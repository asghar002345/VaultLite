import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import Animated from 'react-native-reanimated';

import { Aurora } from '@/components/fx/skia';
import { ConfirmSheet, Notice } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { PinDots } from '@/components/wallet';
import { Spacing } from '@/constants/theme';
import { haptic, useMotion } from '@/motion';
import { vault } from '@/vault';
import { biometricsAvailable } from '@/vault/biometrics';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Lock() {
  useSecureScreen('lock');
  const { unlockWithPin, unlockWithBiometrics, reset } = useSession();
  const [pin, setPin] = useState('');
  const [bio, setBio] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const m = useMotion();

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
      setShake((n) => n + 1);
      setBusy(false);
    }
  };

  return (
    <Screen backdrop={<Aurora intensity={0.8} />}>
      <View style={{ alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xxl }}>
        <Animated.View entering={m.pop()}>
          <T variant="hero">Locked</T>
        </Animated.View>
        <T variant="caption">Enter your 6-digit PIN</T>
        <PinDots length={6} filled={pin.length} error={!!error} shakeKey={shake} />
      </View>
      <Input
        testID="lock-pin"
        placeholder="Enter PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        value={pin}
        onChangeText={(v) => {
          if (v.length > pin.length) haptic.light();
          setError(null);
          setPin(v);
        }}
        onSubmitEditing={submit}
        style={{ textAlign: 'center', letterSpacing: 8 }}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button testID="unlock" title={busy ? 'Unlocking…' : 'Unlock'} disabled={busy || pin.length !== 6} onPress={submit} />
      {bio && <Button variant="secondary" icon="biometrics" title="Use biometrics" onPress={tryBio} />}
      <Button
        title="Reset wallet"
        variant="ghost"
        icon="trash"
        testID="lock-reset"
        onPress={() => setConfirmReset(true)}
      />
      <ConfirmSheet
        visible={confirmReset}
        danger
        title="Reset wallet?"
        body="This erases the encrypted secret from this device. You need your recovery phrase to restore."
        confirmLabel="Erase"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); void reset(); }}
      />
    </Screen>
  );
}
