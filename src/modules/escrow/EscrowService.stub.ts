import type { ChainKey } from '@/config/chains';

import { getEscrowAddress } from './deployments';
import type { EscrowService } from './types';

const notReady = (): never => {
  throw new Error('EscrowService not implemented yet — see docs/INTEGRATIONS.md');
};

/** Placeholder until Day N wires viem/4337. Reads return empty; writes throw. */
export class StubEscrowService implements EscrowService {
  isAvailable(chain: ChainKey) {
    return getEscrowAddress(chain) !== null;
  }
  createEscrow = async () => notReady();
  fund = async () => notReady();
  cancel = async () => notReady();
  approveMilestone = async () => notReady();
  signApproval = async () => notReady();
  refundExpired = async () => notReady();
  approveMilestoneWithSig = async () => notReady();
  submitMilestone = async () => notReady();
  claimAfterReview = async () => notReady();
  providerRefund = async () => notReady();
  raiseDispute = async () => notReady();
  resolveDispute = async () => notReady();
  resolveAfterArbiterTimeout = async () => notReady();
  withdrawable = async () => 0n;
  withdraw = async () => notReady();
  getEscrow = async () => null;
  listForAccount = async () => [];
}
