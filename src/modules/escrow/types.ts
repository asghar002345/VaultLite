/**
 * App-side interface for MilestoneEscrow (see /workspace/milestone-escrow/SPEC.md).
 * Write methods return a TxResult; when routed through an ERC-4337 smart account,
 * `userOpHash` is set as well. All value movements are pull-payments: releases/refunds
 * only credit `withdrawable(account, token)` and parties call `withdraw(token)`.
 */
import type { ChainKey } from '@/config/chains';

export type Hex = `0x${string}`;
export const NATIVE_TOKEN: Hex = '0x0000000000000000000000000000000000000000';

/** Mirrors `enum Status` order in MilestoneEscrow.sol. */
export const ESCROW_STATUS = ['None', 'Created', 'Funded', 'Disputed', 'Resolved', 'Cancelled', 'Refunded', 'Completed'] as const;
export type EscrowStatus = (typeof ESCROW_STATUS)[number];
/** Mirrors `enum MilestoneStatus`. */
export const MILESTONE_STATUS = ['Pending', 'Submitted', 'Released', 'Refunded', 'Resolved'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export interface Milestone {
  index: number;
  amount: bigint;
  submittedAt: number; // unix seconds, 0 if not submitted
  status: MilestoneStatus;
}

export interface Escrow {
  id: bigint;
  chain: ChainKey;
  client: Hex;
  provider: Hex;
  arbiter: Hex;
  /** NATIVE_TOKEN (address(0)) = native ETH, otherwise ERC-20. */
  token: Hex;
  feeBps: number;
  reviewPeriod: number; // seconds, 1h..30d
  deadline: number; // unix seconds
  disputedAt: number;
  total: bigint;
  settled: bigint;
  paidToProvider: bigint;
  status: EscrowStatus;
  milestones: Milestone[];
}

export interface CreateEscrowParams {
  chain: ChainKey;
  provider: Hex;
  arbiter: Hex;
  token: Hex;
  /** 1–50 milestones, each 0 < amt ≤ 2^128-1. */
  amounts: bigint[];
  reviewPeriod: number;
  deadline: number;
}

/** EIP-712: ApproveMilestone(uint256 escrowId,uint256 index,uint256 amount,uint256 sigDeadline) */
export interface ApprovalSignature {
  escrowId: bigint;
  index: number;
  amount: bigint;
  sigDeadline: number;
  signature: Hex;
}

export interface TxResult {
  hash: Hex;
  userOpHash?: Hex;
}

export interface EscrowService {
  isAvailable(chain: ChainKey): boolean;

  // --- client ---
  createEscrow(p: CreateEscrowParams): Promise<TxResult & { escrowId: bigint }>;
  /** Sends exact `total` as msg.value (native) or does approve+fund (ERC-20; batchable via 4337). */
  fund(chain: ChainKey, escrowId: bigint): Promise<TxResult>;
  cancel(chain: ChainKey, escrowId: bigint): Promise<TxResult>;
  approveMilestone(chain: ChainKey, escrowId: bigint, index: number): Promise<TxResult>;
  /** Off-chain EIP-712 approval by the client; anyone can relay it. No tx. */
  signApproval(chain: ChainKey, escrowId: bigint, index: number, sigDeadline: number): Promise<ApprovalSignature>;
  refundExpired(chain: ChainKey, escrowId: bigint): Promise<TxResult>;

  // --- relayer (anyone) ---
  approveMilestoneWithSig(chain: ChainKey, sig: ApprovalSignature): Promise<TxResult>;

  // --- provider ---
  submitMilestone(chain: ChainKey, escrowId: bigint, index: number): Promise<TxResult>;
  claimAfterReview(chain: ChainKey, escrowId: bigint, index: number): Promise<TxResult>;
  providerRefund(chain: ChainKey, escrowId: bigint): Promise<TxResult>;

  // --- disputes ---
  raiseDispute(chain: ChainKey, escrowId: bigint): Promise<TxResult>;
  /** Arbiter only. providerShareBps in [0, 10000]. */
  resolveDispute(chain: ChainKey, escrowId: bigint, providerShareBps: number): Promise<TxResult>;
  resolveAfterArbiterTimeout(chain: ChainKey, escrowId: bigint): Promise<TxResult>;

  // --- pull payments ---
  withdrawable(chain: ChainKey, account: Hex, token: Hex): Promise<bigint>;
  withdraw(chain: ChainKey, token: Hex): Promise<TxResult>;

  // --- reads ---
  getEscrow(chain: ChainKey, escrowId: bigint): Promise<Escrow | null>;
  listForAccount(chain: ChainKey, account: Hex): Promise<Escrow[]>;
}
