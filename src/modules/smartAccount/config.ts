import type { ChainKey } from '@/config/chains';

import type { SmartAccountChainConfig } from './types';

export const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

/** Blockchain Dev's deployment on Base Sepolia (84532). */
export const BASE_SEPOLIA_CONTRACTS = {
  accountFactory: '0xb5c86d7ec6a86074732e8b697a9f90cd8de0eff0',
  smartAccountImpl: '0x997f0ffcf65c272bbee57be2f50bb8712f276799',
  ecdsaOwnerValidator: '0x45b0db483849bf723fe288751297cddc29e7198b',
  sessionKeyValidator: '0x93a4993b2047862a32864cef09233fdca718b3a2',
  recoveryExecutor: '0x5a1c201cc401b0b1d0e213d6e99201939688812c',
  escrowExecutor: '0x72a87a92c1373ae3c0f9e42c06e1e6c113d17ec6',
} as const satisfies Record<string, `0x${string}`>;

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
    factory: BASE_SEPOLIA_CONTRACTS.accountFactory,
    // Same proxy endpoint serves bundler (eth_*/pimlico_*) and paymaster (pm_*) methods.
    bundlerUrl: bundlerProxyUrl(84532),
    paymasterUrl: bundlerProxyUrl(84532),
  },
};

export const isSmartAccountConfigured = (c?: SmartAccountChainConfig): boolean =>
  !!c && !!c.factory && !!c.bundlerUrl;
