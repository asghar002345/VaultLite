import type { ChainKey } from '@/config/chains';

import type { SmartAccountChainConfig } from './types';

export const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

/**
 * Plan: EntryPoint v0.7, single EOA owner (m/44'/60'/0'/0/0 from the app seed),
 * factory with counterfactual CREATE2 addresses, Pimlico bundler + paymaster on Base Sepolia.
 * Pimlico URL shape: https://api.pimlico.io/v2/84532/rpc?apikey=<KEY> (same endpoint serves
 * bundler + paymaster RPCs). Keep the key out of git: EXPO_PUBLIC_PIMLICO_URL_BASE_SEPOLIA in .env.
 */
export const SMART_ACCOUNT_CONFIG: Partial<Record<ChainKey, SmartAccountChainConfig>> = {
  baseSepolia: {
    chain: 'baseSepolia',
    entryPoint: ENTRY_POINT_V07,
    factory: null, // TODO: teammate's account factory address
    bundlerUrl: process.env.EXPO_PUBLIC_PIMLICO_URL_BASE_SEPOLIA ?? null,
    paymasterUrl: process.env.EXPO_PUBLIC_PIMLICO_URL_BASE_SEPOLIA ?? null,
  },
};

export const isSmartAccountConfigured = (c?: SmartAccountChainConfig): boolean =>
  !!c && !!c.factory && !!c.bundlerUrl;
