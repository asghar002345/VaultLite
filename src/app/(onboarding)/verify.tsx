import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { buildQuiz } from '@/crypto/quiz';
import { useSession } from '@/vault/session';
import { useSecureScreen } from '@/hooks/use-secure-screen';

export default function Verify() {
  useSecureScreen('verify');
  const { pending } = useSession();
  const mnemonic = pending?.kind === 'mnemonic' ? pending.mnemonic : null;
  const quiz = useMemo(() => (mnemonic ? buildQuiz(mnemonic.split(' ')) : []), [mnemonic]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!mnemonic) return <Redirect href="/welcome" />;

  const done = quiz.every((q) => picks[q.index]);
  const check = () => {
    if (quiz.every((q) => picks[q.index] === q.answer)) router.push('/security');
    else {
      setError('Some words are wrong. Check your backup and try again.');
      setPicks({});
    }
  };

  return (
    <Screen>
      <T variant="title">Verify your backup</T>
      {quiz.map((q) => (
        <Card key={q.index}>
          <T>Word #{q.index + 1}</T>
          <View style={styles.row}>
            {q.options.map((o) => (
              <View key={o} style={styles.opt}>
                <Button
                  variant={picks[q.index] === o ? 'primary' : 'secondary'}
                  title={o}
                  onPress={() => setPicks((p) => ({ ...p, [q.index]: o }))}
                />
              </View>
            ))}
          </View>
        </Card>
      ))}
      {error && <T variant="error">{error}</T>}
      <Button title="Continue" disabled={!done} onPress={check} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  opt: { width: '47%' },
});
