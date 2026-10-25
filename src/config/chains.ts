/** Testnets ONLY. Do not add mainnets to this registry. */
export type ChainFamily = 'evm' | 'tron' | 'solana';

export interface ChainConfig {
  key: string;
  family: ChainFamily;
  name: string;
  /** EVM numeric chain id; for Tron, the network's genesis-derived id is not used here. */
  chainId: number | null;
  /** CAIP-2 identifier used by WalletConnect / Reown. */
  caip2: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  explorerUrl: string;
  faucetUrl?: string;
  testnet: true;
}

export const CHAINS = {
  sepolia: {
    key: 'sepolia',
    family: 'evm',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    caip2: 'eip155:11155111',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://rpc.sepolia.org'],
    explorerUrl: 'https://sepolia.etherscan.io',
    faucetUrl: 'https://sepoliafaucet.com',
    testnet: true,
  },
  polygonAmoy: {
    key: 'polygonAmoy',
    family: 'evm',
    name: 'Polygon Amoy',
    chainId: 80002,
    caip2: 'eip155:80002',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://rpc-amoy.polygon.technology'],
    explorerUrl: 'https://amoy.polygonscan.com',
    faucetUrl: 'https://faucet.polygon.technology',
    testnet: true,
  },
  bscTestnet: {
    key: 'bscTestnet',
    family: 'evm',
    name: 'BNB Smart Chain Testnet',
    chainId: 97,
    caip2: 'eip155:97',
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
    explorerUrl: 'https://testnet.bscscan.com',
    faucetUrl: 'https://www.bnbchain.org/en/testnet-faucet',
    testnet: true,
  },
  baseSepolia: {
    key: 'baseSepolia',
    family: 'evm',
    name: 'Base Sepolia',
    chainId: 84532,
    caip2: 'eip155:84532',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
    explorerUrl: 'https://sepolia.basescan.org',
    testnet: true,
  },
  tronNile: {
    key: 'tronNile',
    family: 'tron',
    name: 'Tron Nile Testnet',
    chainId: null,
    // CAIP-2 = 'tron:' + last 4 bytes of the genesis block id. Verified 2026-10-25: Nile genesis
    // blockID …cd8690dc (TronGrid getblockbynum 0) and Reown Tron RPC docs use tron:0xcd8690dc.
    caip2: 'tron:0xcd8690dc',
    nativeCurrency: { name: 'TRX', symbol: 'TRX', decimals: 6 },
    rpcUrls: ['https://nile.trongrid.io'],
    explorerUrl: 'https://nile.tronscan.org',
    faucetUrl: 'https://nileex.io/join/getJoinPage',
    testnet: true,
  },
} as const satisfies Record<string, ChainConfig>;

export type ChainKey = keyof typeof CHAINS;
export const CHAIN_LIST: ChainConfig[] = Object.values(CHAINS);
export const EVM_CHAINS = CHAIN_LIST.filter((c) => c.family === 'evm');
export const getChain = (k: ChainKey): ChainConfig => CHAINS[k];
