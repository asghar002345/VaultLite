import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Notice, PinField } from '@/components/states';
import { Button, Card, Screen, T } from '@/components/ui';
import { useSecureScreen } from '@/hooks/use-secure-screen';
import { useSession } from '@/vault/session';

export default function Reveal() {
  useSecureScreen('reveal');
  const { revealSecret } = useSession();
  const [pin, setPin] = useState('');
  const [words, setWords] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => setWords(null), []);

  return (
    <Screen testID="settings-reveal">
      <Notice tone="danger">Anyone with this phrase controls your wallet. Never share it or paste it into a website.</Notice>
      {words ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {words.map((w, i) => (
                <T key={i} variant="mono" style={{ width: '30%' }}>{i + 1}. {w}</T>
              ))}
            </View>
          </Card>
          <Button variant="secondary" icon="copy" title="Copy (clears in 60 s)" onPress={async () => {
            await Clipboard.setStringAsync(words.join(' '));
            setTimeout(() => Clipboard.setStringAsync(''), 60_000);
          }} />
          <Button testID="reveal-hide" variant="ghost" icon="hide" title="Hide" onPress={() => { setWords(null); setPin(''); }} />
        </>
      ) : (
        <>
          <PinField testID="reveal-pin" label="Enter PIN to reveal" value={pin} onChange={setPin} error={err} />
          <Button testID="reveal-submit" icon="show" title={busy ? 'Decrypting…' : 'Reveal'} loading={busy} disabled={pin.length < 6} onPress={async () => {
            setBusy(true); setErr(null);
            try { const sec = await revealSecret(pin); setWords(sec.kind === 'mnemonic' ? sec.mnemonic.split(' ') : [(sec as { privateKey: string }).privateKey]); }
            catch { setErr('Incorrect PIN'); }
            finally { setBusy(false); }
          }} />
        </>
      )}
    </Screen>
  );
}
