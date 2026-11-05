import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, parseSettings, type AppSettings } from './settings-core';

export * from './settings-core';

const KEY = 'vaultlite.settings.v1';
let state: AppSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadSettings() {
  try {
    state = parseSettings(await AsyncStorage.getItem(KEY));
  } catch {
    state = DEFAULT_SETTINGS;
  }
  loaded = true;
  emit();
  return state;
}

export async function updateSettings(patch: Partial<Omit<AppSettings, 'v'>>) {
  state = { ...state, ...patch };
  emit();
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export const getSettings = () => state;
export const settingsLoaded = () => loaded;

/** Non-secret app preferences (theme, auto-lock, hidden chains). Shared, synchronous reads. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
