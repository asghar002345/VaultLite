import type { ChainKey } from '@/config/chains';

import type { SmartAccountChainConfig } from './types';

export const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

/**
 * Plan: EntryPoint v0.7, single EOA owner (m/44'/60'/0'/0/0 from the app seed),
 * factory with counterfactual CREATE2 addresses, Pimlico bundler + paymaster on Base Sepolia.
 *
 * No Pimlico API key ships in the app. Bundler + paymaster JSON-RPC goes through our own
 * proxy (docs/BUNDLER_PROXY.md): POST {EXPO_PUBLIC_BUNDLER_PROXY_URL}/api/bundler/84532.
 * The proxy holds PIMLICO_API_KEY server-side and enforces method/chain allowlists,
 * rate limits and the sponsorship policy.
 */
export function bundlerProxyUrl(chainId: number, base: string | undefined = process.env.EXPO_PUBLIC_BUNDLER_PROXY_URL): string | null {
  const b = base?.trim().replace(/\/+$/, '');
  return b ? `${b}/api/bundler/${chainId}` : null;
}

export const SMART_ACCOUNT_CONFIG: Partial<Record<ChainKey, SmartAccountChainConfig>> = {
  baseSepolia: {
    chain: 'baseSepolia',
    entryPoint: ENTRY_POINT_V07,
    factory: null, // TODO: teammate's account factory address
    // Same proxy endpoint serves bundler (eth_*/pimlico_*) and paymaster (pm_*) methods.
    bundlerUrl: bundlerProxyUrl(84532),
    paymasterUrl: bundlerProxyUrl(84532),
  },
};

export const isSmartAccountConfigured = (c?: SmartAccountChainConfig): boolean =>
  !!c && !!c.factory && !!c.bundlerUrl;
