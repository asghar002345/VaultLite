import { useMemo } from 'react';

import { useReauth } from '@/hooks/use-reauth';
import { useSession } from '@/vault/session';

import { ViemEscrowService } from './EscrowService.viem';

export const ESCROW_CHAIN = 'baseSepolia' as const;
export const ESCROW_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

/** Escrow service bound to the session key; every write/sign goes through biometric (or PIN) re-auth. */
export function useEscrow() {
  const { accounts, withKeys } = useSession();
  const auth = useReauth();
  const { verify } = auth;
  const service = useMemo(
    () => new ViemEscrowService({ withKey: (fn) => withKeys((k) => fn(k.evm)), authorize: async () => (await verify()) === null }),
    [withKeys, verify],
  );
  return { service, auth, me: accounts?.evm.address ?? null };
}
