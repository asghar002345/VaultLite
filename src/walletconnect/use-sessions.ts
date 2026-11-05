import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isReownConfigured } from '@/config/env';

import { getWalletKit, listSessions, subscribe } from './walletkit';

export const sessionsKey = ['wc-sessions'];

export function useSessions() {
  const q = useQuery({ queryKey: sessionsKey, queryFn: async () => { await getWalletKit(); return listSessions(); }, enabled: isReownConfigured() });
  const { refetch } = q;
  useEffect(() => subscribe({ onSessionsChanged: () => void refetch() }), [refetch]);
  return q;
}

