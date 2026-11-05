import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { toggleFavorite } from '@/services/market/filters';

const KEY = 'vaultlite.market.favorites.v1';
let favs: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function parseFavorites(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[A-Z0-9]{2,20}$/.test(x)) : [];
  } catch {
    return [];
  }
}

async function load() {
  if (loaded) return;
  loaded = true;
  favs = parseFavorites(await AsyncStorage.getItem(KEY).catch(() => null));
  emit();
}

export async function toggleFav(symbol: string) {
  favs = toggleFavorite(favs, symbol);
  emit();
  await AsyncStorage.setItem(KEY, JSON.stringify(favs));
}

/** Persisted list of favorite Binance symbols (non-secret). */
export function useFavorites(): string[] {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => favs,
    () => favs,
  );
}
