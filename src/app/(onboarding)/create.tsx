import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Card, Screen, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMotion } from '@/motion';
import { newMnemonic } from '@/crypto/derive';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Create() {
  useSecureScreen('create');
  const { setPending } = useSession();
  const [mnemonic] = useState(() => newMnemonic(128));
  const [revealed, setRevealed] = useState(false);
  const words = mnemonic.split(' ');
  const t = useTheme();
  const m = useMotion();

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
              <Animated.View key={i} entering={m.enter(i)} style={styles.cell}>
                <View style={[styles.chip, { backgroundColor: t.surfaceRaised, borderColor: t.border }]}>
                  <T variant="caption" style={{ width: 20 }}>{i + 1}</T>
                  <T variant="mono" style={{ fontSize: 15 }}>{w}</T>
                </View>
              </Animated.View>
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
  cell: { width: '50%', paddingHorizontal: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1 },
});
