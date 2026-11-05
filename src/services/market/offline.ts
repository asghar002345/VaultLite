import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Offline signal for market data. NetInfo on native; on web Chromium NetInfo listens to
 * navigator.connection 'change' (which doesn't fire for plain offline), so also use
 * window online/offline + navigator.onLine.
 */
let netOffline = false;

/** Offline = no link, or a link with confirmed no internet (captive portal / dead Wi-Fi). null = unknown → online. */
export const offlineFromNetState = (s: { isConnected: boolean | null; isInternetReachable?: boolean | null }) =>
  s.isConnected === false || s.isInternetReachable === false;
let webOffline = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine === false : false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;

function start() {
  if (started) return;
  started = true;
  NetInfo.addEventListener((s) => {
    const v = offlineFromNetState(s);
    if (v !== netOffline) {
      netOffline = v;
      emit();
    }
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const upd = () => {
      webOffline = navigator.onLine === false;
      emit();
    };
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
  }
}

export const isOffline = () => netOffline || webOffline;
export function subscribeOffline(l: () => void) {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const useOffline = () => useSyncExternalStore(subscribeOffline, isOffline, isOffline);

/**
 * Drive React Query's onlineManager from this signal, so queries (polling, retries, refetches) pause
 * while offline and resume on reconnect. React Native has no default online detection.
 */
export function bindOnlineManager(om: { setEventListener: (setup: (setOnline: (online: boolean) => void) => () => void) => void }) {
  om.setEventListener((setOnline) => {
    setOnline(!isOffline());
    return subscribeOffline(() => setOnline(!isOffline()));
  });
}
