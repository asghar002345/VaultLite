import type { PublicClient } from 'viem';

import { accountFactoryAbi } from './abis';
import { BASE_SEPOLIA_CONTRACTS as C } from './config';
import { DEFAULT_SALT, encodeInitData } from './encoding';
import type { Hex } from './types';

/** Key-free status read for UI: counterfactual address (factory.getAddress eth_call) + deployment. */
export async function readSmartAccountStatus(client: PublicClient, owner: Hex, salt: Hex = DEFAULT_SALT) {
  const address = await client.readContract({
    address: C.accountFactory,
    abi: accountFactoryAbi,
    functionName: 'getAddress',
    args: [encodeInitData(owner), salt],
  });
  const code = await client.getCode({ address });
  return { address, deployed: !!code && code !== '0x' };
}
