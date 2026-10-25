import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { newMnemonic } from '@/crypto/derive';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Create() {
  useSecureScreen('create');
  const { setPending } = useSession();
  const [mnemonic] = useState(() => newMnemonic(128));
  const [revealed, setRevealed] = useState(false);
  const words = mnemonic.split(' ');

  return (
    <Screen>
      <T variant="title">Your recovery phrase</T>
      <T variant="caption">
        Write these 12 words down in order and store them offline. Anyone with them controls your funds.
      </T>
      <Card>
        {revealed ? (
          <View style={styles.grid}>
            {words.map((w, i) => (
              <T key={i} variant="mono" style={styles.word}>
                {i + 1}. {w}
              </T>
            ))}
          </View>
        ) : (
          <Button variant="secondary" title="Tap to reveal" onPress={() => setRevealed(true)} />
        )}
      </Card>
      <Button
        title="I wrote it down"
        disabled={!revealed}
        onPress={() => {
          setPending({ kind: 'mnemonic', mnemonic });
          router.push('/verify');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.sm },
  word: { width: '50%' },
});
