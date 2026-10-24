import type { ChainKey } from '@/config/chains';

import { milestoneEscrowAbi } from './abi/MilestoneEscrow';
import type { Hex } from './types';

export interface EscrowDeployment {
  chain: ChainKey;
  /** null until the contract is deployed — the service reports isAvailable() = false. */
  address: Hex | null;
  abi: typeof milestoneEscrowAbi;
  deployBlock?: bigint;
  /** EIP-712 domain (chainId/verifyingContract come from chain + address). */
  eip712: { name: 'MilestoneEscrow'; version: '1' };
}

export const ESCROW_DEPLOYMENTS: Partial<Record<ChainKey, EscrowDeployment>> = {
  baseSepolia: {
    chain: 'baseSepolia', // chainId 84532
    address: null, // TODO: set once MilestoneEscrow is deployed (or read EXPO_PUBLIC_ESCROW_ADDRESS_BASE_SEPOLIA)
    abi: milestoneEscrowAbi,
    eip712: { name: 'MilestoneEscrow', version: '1' },
  },
};

export const getEscrowAddress = (chain: ChainKey): Hex | null => {
  const fromEnv = chain === 'baseSepolia' ? process.env.EXPO_PUBLIC_ESCROW_ADDRESS_BASE_SEPOLIA : undefined;
  if (fromEnv && /^0x[0-9a-fA-F]{40}$/.test(fromEnv)) return fromEnv as Hex;
  return ESCROW_DEPLOYMENTS[chain]?.address ?? null;
};
