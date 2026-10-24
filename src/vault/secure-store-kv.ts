import * as SecureStore from 'expo-secure-store';

import type { SecureKV } from './storage';

const base: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureStoreKV: SecureKV = {
  get: (key, opts) =>
    SecureStore.getItemAsync(key, {
      ...base,
      requireAuthentication: opts?.requireAuth,
      authenticationPrompt: opts?.prompt,
    }),
  set: (key, value, opts) =>
    SecureStore.setItemAsync(key, value, { ...base, requireAuthentication: opts?.requireAuth }),
  remove: (key) => SecureStore.deleteItemAsync(key, base),
};
