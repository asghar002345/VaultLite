import { MemoryKV, type SecureKV } from './storage';

/**
 * Web build is a demo/preview surface only (used for screenshots). There is no secure enclave in
 * a browser, so secrets are kept in memory for the tab's lifetime and never persisted.
 */
export const secureStoreKV: SecureKV = new MemoryKV();
