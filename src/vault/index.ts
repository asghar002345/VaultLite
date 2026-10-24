import { secureStoreKV } from './secure-store-kv';
import { Vault } from './vault';

export const vault = new Vault(secureStoreKV);
export * from './vault';
