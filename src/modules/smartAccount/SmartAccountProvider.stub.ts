import type { ChainKey } from '@/config/chains';

import type { Call, Hex, SmartAccountProvider, UserOperation } from './types';

const notReady = (): never => {
  throw new Error('SmartAccountProvider not implemented yet — see docs/INTEGRATIONS.md');
};

export class StubSmartAccountProvider implements SmartAccountProvider {
  constructor(
    readonly chain: ChainKey,
    /** EOA owner/signer address derived from the vault. */
    readonly owner: Hex,
  ) {}
  getAddress = async (): Promise<Hex> => notReady();
  isDeployed = async () => false;
  buildUserOperation = async (_calls: Call[]): Promise<UserOperation> => notReady();
  sendUserOperation = async (_calls: Call[]): Promise<{ userOpHash: Hex }> => notReady();
  waitForReceipt = async (_h: Hex): Promise<{ txHash: Hex; success: boolean }> => notReady();
}
