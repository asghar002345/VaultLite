import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Input, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  isValidMnemonic,
  isValidPrivateKey,
  normalizeMnemonic,
  normalizePrivateKey,
} from '@/crypto/derive';
import { useSession } from '@/vault/session';

type Mode = 'mnemonic' | 'privateKey';

export default function Import() {
  const { setPending } = useSession();
  const [mode, setMode] = useState<Mode>('mnemonic');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (mode === 'mnemonic') {
      if (!isValidMnemonic(value)) return setError('Invalid recovery phrase (check words & checksum).');
      setPending({ kind: 'mnemonic', mnemonic: normalizeMnemonic(value) });
    } else {
      if (!isValidPrivateKey(value)) return setError('Private key must be 64 hex characters.');
      setPending({ kind: 'privateKey', privateKey: normalizePrivateKey(value) });
    }
    setValue('');
    router.push('/security');
  };

  return (
    <Screen>
      <T variant="title">Import wallet</T>
      <View style={styles.row}>
        {(['mnemonic', 'privateKey'] as const).map((m) => (
          <View key={m} style={styles.flex}>
            <Button
              variant={mode === m ? 'primary' : 'secondary'}
              title={m === 'mnemonic' ? 'Recovery phrase' : 'Private key'}
              onPress={() => {
                setMode(m);
                setError(null);
              }}
            />
          </View>
        ))}
      </View>
      <Input
        multiline={mode === 'mnemonic'}
        secureTextEntry={mode === 'privateKey'}
        placeholder={mode === 'mnemonic' ? '12 or 24 words separated by spaces' : '0x…'}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setError(null);
        }}
        style={mode === 'mnemonic' ? styles.area : undefined}
      />
      {error && <T variant="error">{error}</T>}
      <Button title="Continue" disabled={!value.trim()} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  area: { minHeight: 120, textAlignVertical: 'top' },
});
