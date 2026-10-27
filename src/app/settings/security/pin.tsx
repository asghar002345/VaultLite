import { router } from 'expo-router';
import { useState } from 'react';

import { Notice, PinField, SuccessState } from '@/components/states';
import { Button, Screen } from '@/components/ui';
import { useSession } from '@/vault/session';

export default function ChangePin() {
  const { changePin } = useSession();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const validation = next.length === 0 ? null : (/^\d{6}$/.test(next) ? null : 'PIN must be 6 digits') ?? (again.length >= 6 && again !== next ? 'PINs do not match' : next === cur ? 'New PIN must differ from current PIN' : null);
  const canSubmit = cur.length >= 6 && next.length >= 6 && again === next && !validation && !busy;

  if (done) return (
    <Screen testID="pin-done">
      <SuccessState title="PIN changed" body="Your vault was re-encrypted with the new PIN.">
        <Button testID="pin-done-back" title="Back to Security" onPress={() => router.back()} />
      </SuccessState>
    </Screen>
  );

  return (
    <Screen testID="settings-pin">
      <PinField testID="pin-current" label="Current PIN" value={cur} onChange={setCur} />
      <PinField testID="pin-new" label="New PIN" value={next} onChange={setNext} />
      <PinField testID="pin-again" label="Confirm new PIN" value={again} onChange={setAgain} error={validation} />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button
        testID="pin-submit"
        title={busy ? 'Re-encrypting…' : 'Change PIN'}
        disabled={!canSubmit}
        onPress={async () => {
          setBusy(true); setErr(null);
          try { await changePin(cur, next); setDone(true); }
          catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}
      />
    </Screen>
  );
}
