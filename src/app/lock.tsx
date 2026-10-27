import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import Animated from 'react-native-reanimated';

import { Monogram } from '@/components/brand';
import { applyKey, Keypad } from '@/components/keypad';
import { ConfirmSheet } from '@/components/states';
import { Button, Screen, T } from '@/components/ui';
import { PinDots } from '@/components/wallet';
import { Spacing } from '@/constants/theme';
import { useMotion } from '@/motion';
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

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPin(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin('');
      setShake((n) => n + 1);
      setBusy(false);
    }
  };
  const onKey = useCallback(
    (k: string) => {
      if (busy) return;
      if (k === 'bio') return void tryBio();
      setError(null);
      const next = applyKey(pin, k, { maxLength: 6 });
      if (next === pin) return;
      setPin(next);
      if (next.length === 6) void submit(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, tryBio, pin],
  );

  return (
    <Screen scroll={false} testID="lock">
      <View style={{ flex: 1, justifyContent: 'center', gap: Spacing.xl }}>
        <View style={{ alignItems: 'center', gap: Spacing.md }}>
          <Animated.View entering={m.pop()}>
            <Monogram size={64} />
          </Animated.View>
          <T variant="title" style={{ textAlign: 'center' }}>Enter PIN</T>
          <T variant="caption" style={{ textAlign: 'center' }}>Unlock your VaultLite wallet</T>
          <View testID="lock-dots" accessibilityLabel={`${pin.length} of 6 digits entered`}>
            <PinDots length={6} filled={pin.length} error={!!error} shakeKey={shake} />
          </View>
          {error ? <T variant="error" style={{ textAlign: 'center' }}>{error}</T> : <T variant="caption"> </T>}
        </View>
        <Keypad round onKey={onKey} disabled={busy} left={bio ? { key: 'bio', icon: 'face', accessibilityLabel: 'Unlock with biometrics' } : null} />
      </View>
      <Button
        title="Forgot PIN?"
        variant="ghost"
        testID="lock-reset"
        onPress={() => setConfirmReset(true)}
      />
      <ConfirmSheet
        visible={confirmReset}
        danger
        title="Reset wallet?"
        body="Without the PIN the only way back in is your recovery phrase. This erases the encrypted wallet from this device so you can restore it."
        confirmLabel="Erase"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { setConfirmReset(false); void reset(); }}
      />
    </Screen>
  );
}
