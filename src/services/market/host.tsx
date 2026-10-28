import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { marketSink } from '@/hooks/use-market';
import { setBackground, setMarketSink, setOffline } from './socket-host';

/** Mount once (unlocked). Wires WS → React Query, pauses on background/offline, closes on unmount. */
export function MarketHost() {
  const qc = useQueryClient();
  useEffect(() => {
    setMarketSink(marketSink(qc));
    const app = AppState.addEventListener('change', (s) => setBackground(s !== 'active'));
    const net = NetInfo.addEventListener((s) => setOffline(s.isConnected === false));
    return () => {
      app.remove();
      net();
      setMarketSink(null);
    };
  }, [qc]);
  return null;
}
