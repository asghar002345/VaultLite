import type { ChainKey } from './chains';

export interface TokenInfo {
  chain: ChainKey;
  /** 'native' for the chain's gas token; 0x… (EVM) or base58 (Tron TRC-20) otherwise. */
  address: 'native' | string;
  symbol: string;
  name: string;
  decimals: number;
  /** Treated as $1 for the demo "total" (testnet tokens have no real value). */
  stable?: boolean;
  source?: string;
}

export const NATIVE = 'native' as const;

const CIRCLE = 'https://developers.circle.com/stablecoins/usdc-contract-addresses';
const NILE_FAUCET = 'https://nileex.io/join/getJoinPage';

/**
 * Curated testnet tokens. Only addresses verified against an official source are listed
 * (checked 2026-10-25). Skipped: USDC on BSC Testnet (Circle lists none) and test USDT on
 * every EVM testnet (Tether publishes no official testnet deployments).
 */
export const TOKENS: TokenInfo[] = [
  { chain: 'sepolia', address: NATIVE, symbol: 'ETH', name: 'Sepolia Ether', decimals: 18 },
  { chain: 'sepolia', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', name: 'USD Coin (test)', decimals: 6, stable: true, source: CIRCLE },
  { chain: 'polygonAmoy', address: NATIVE, symbol: 'POL', name: 'POL', decimals: 18 },
  { chain: 'polygonAmoy', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', symbol: 'USDC', name: 'USD Coin (test)', decimals: 6, stable: true, source: CIRCLE },
  { chain: 'bscTestnet', address: NATIVE, symbol: 'tBNB', name: 'tBNB', decimals: 18 },
  { chain: 'baseSepolia', address: NATIVE, symbol: 'ETH', name: 'Sepolia Ether', decimals: 18 },
  { chain: 'baseSepolia', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', name: 'USD Coin (test)', decimals: 6, stable: true, source: CIRCLE },
  { chain: 'tronNile', address: NATIVE, symbol: 'TRX', name: 'Tron (Nile)', decimals: 6 },
  { chain: 'tronNile', address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', symbol: 'USDT', name: 'Tether USD (Nile test)', decimals: 6, stable: true, source: NILE_FAUCET },
];

export const findToken = (chain: string, address: string) =>
  TOKENS.find((t) => t.chain === chain && t.address.toLowerCase() === address.toLowerCase());
