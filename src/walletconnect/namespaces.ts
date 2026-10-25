import { EVM_CHAINS, CHAINS } from '@/config/chains';

export const EVM_METHODS = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
] as const;
export const EVM_EVENTS = ['chainChanged', 'accountsChanged'] as const;
export const TRON_METHODS = ['tron_signTransaction', 'tron_signMessage'] as const;

/** Testnet-only namespaces this wallet can approve. */
export function supportedNamespaces(evmAddress: string, tronAddress: string) {
  const evmChains = EVM_CHAINS.map((c) => c.caip2);
  const tron = CHAINS.tronNile.caip2;
  return {
    eip155: {
      chains: evmChains,
      methods: [...EVM_METHODS],
      events: [...EVM_EVENTS],
      accounts: evmChains.map((c) => `${c}:${evmAddress}`),
    },
    tron: {
      chains: [tron],
      methods: [...TRON_METHODS],
      events: [],
      accounts: [`${tron}:${tronAddress}`],
    },
  };
}
