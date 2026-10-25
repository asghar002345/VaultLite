import { useEffect, useState } from 'react';

import { useSession } from '@/vault/session';

/** Biometric re-auth when enabled, otherwise a 6-digit PIN typed on the screen. */
export function useReauth() {
  const { reauth, canBiometricReauth } = useSession();
  const [bio, setBio] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  useEffect(() => void canBiometricReauth().then(setBio), [canBiometricReauth]);
  return {
    bio,
    pin,
    setPin,
    needsPin: bio === false,
    ready: bio === true || (bio === false && pin.length === 6),
    verify: async () => {
      const ok = bio ? await reauth() : await reauth(pin);
      if (!ok) setPin('');
      return ok ? null : bio ? 'Biometric check failed' : 'Wrong PIN';
    },
  };
}
