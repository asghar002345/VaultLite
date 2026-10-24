import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { deriveAccounts, type DerivedAccounts, type WalletSecret } from '@/crypto/derive';

import { vault } from './index';

type Status = 'loading' | 'empty' | 'locked' | 'unlocked';

interface SessionCtx {
  status: Status;
  accounts: DerivedAccounts | null;
  /** Secret staged during onboarding (before the vault is created). Memory only. */
  pending: WalletSecret | null;
  setPending: (s: WalletSecret | null) => void;
  createVault: (pin: string, biometrics: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<void>;
  lock: () => void;
  reset: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [accounts, setAccounts] = useState<DerivedAccounts | null>(null);
  const [pending, setPending] = useState<WalletSecret | null>(null);
  // Secret held only in memory while unlocked; never persisted in plaintext.
  const secretRef = useRef<WalletSecret | null>(null);

  useEffect(() => {
    vault.exists().then((e) => setStatus(e ? 'locked' : 'empty'));
  }, []);

  const open = useCallback((s: WalletSecret) => {
    secretRef.current = s;
    setAccounts(deriveAccounts(s));
    setStatus('unlocked');
  }, []);

  const lock = useCallback(() => {
    secretRef.current = null;
    setAccounts(null);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  // Auto-lock whenever the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        lock();
        setPending(null);
      }
    });
    return () => sub.remove();
  }, [lock]);

  const value = useMemo<SessionCtx>(
    () => ({
      status,
      accounts,
      pending,
      setPending,
      createVault: async (pin, biometrics) => {
        if (!pending) throw new Error('Nothing to save');
        await vault.create(pending, pin, { biometrics });
        const s = pending;
        setPending(null);
        open(s);
      },
      unlockWithPin: async (pin) => open(await vault.unlockWithPin(pin)),
      unlockWithBiometrics: async () => open(await vault.unlockWithBiometrics()),
      lock,
      reset: async () => {
        await vault.wipe();
        secretRef.current = null;
        setAccounts(null);
        setPending(null);
        setStatus('empty');
      },
    }),
    [status, accounts, pending, open, lock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
