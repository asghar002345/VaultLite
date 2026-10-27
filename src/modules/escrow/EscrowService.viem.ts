import { createWalletClient, erc20Abi, fallback, http, parseEventLogs, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { CHAINS, type ChainKey } from '@/config/chains';
import { isEvmChain, publicClient as defaultPublicClient, VIEM_CHAINS, type EvmChainKey } from '@/services/evm';

import { milestoneEscrowAbi } from './abi/MilestoneEscrow';
import { ESCROW_DEPLOYMENTS, getEscrowAddress } from './deployments';
import {
  ESCROW_STATUS,
  MILESTONE_STATUS,
  NATIVE_TOKEN,
  type ApprovalSignature,
  type CreateEscrowParams,
  type Escrow,
  type EscrowService,
  type Hex,
  type TxResult,
} from './types';

export interface EscrowDeps {
  /** Runs `fn` with the unlocked EVM private key (session.withKeys). */
  withKey: <T>(fn: (pk: Hex) => Promise<T>) => Promise<T>;
  /** Biometric / PIN gate. Must resolve true before any signature is produced. */
  authorize: (reason: string) => Promise<boolean>;
  publicClient?: (chain: EvmChainKey) => PublicClient;
  /** Max escrow ids scanned by listForAccount (newest first). */
  scanLimit?: number;
}

export const APPROVE_TYPES = {
  ApproveMilestone: [
    { name: 'escrowId', type: 'uint256' },
    { name: 'index', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const;

export const approvalTypedData = (chain: EvmChainKey, verifyingContract: Hex, m: { escrowId: bigint; index: number; amount: bigint; sigDeadline: number }) => ({
  domain: { name: 'MilestoneEscrow', version: '1', chainId: VIEM_CHAINS[chain].id, verifyingContract },
  types: APPROVE_TYPES,
  primaryType: 'ApproveMilestone' as const,
  message: { escrowId: m.escrowId, index: BigInt(m.index), amount: m.amount, sigDeadline: BigInt(m.sigDeadline) },
});

type RawEscrow = {
  client: Hex; feeBps: number; reviewPeriod: bigint; status: number; provider: Hex; deadline: bigint;
  arbiter: Hex; disputedAt: bigint; token: Hex; total: bigint; settled: bigint; paidToProvider: bigint;
};
type RawMilestone = { amount: bigint; submittedAt: bigint; status: number };

export function mapEscrow(chain: ChainKey, id: bigint, e: RawEscrow, ms: readonly RawMilestone[]): Escrow | null {
  if (e.status === 0) return null;
  return {
    id, chain, client: e.client, provider: e.provider, arbiter: e.arbiter, token: e.token,
    feeBps: Number(e.feeBps), reviewPeriod: Number(e.reviewPeriod), deadline: Number(e.deadline), disputedAt: Number(e.disputedAt),
    total: e.total, settled: e.settled, paidToProvider: e.paidToProvider,
    status: ESCROW_STATUS[e.status] ?? 'None',
    milestones: ms.map((m, index) => ({ index, amount: m.amount, submittedAt: Number(m.submittedAt), status: MILESTONE_STATUS[m.status] ?? 'Pending' })),
  };
}

export class AuthorizationDenied extends Error {
  constructor() {
    super('Authorization cancelled');
  }
}

export class ViemEscrowService implements EscrowService {
  constructor(private deps: EscrowDeps) {}

  isAvailable(chain: ChainKey) {
    return isEvmChain(chain) && getEscrowAddress(chain) !== null;
  }

  private ctx(chain: ChainKey) {
    const address = getEscrowAddress(chain);
    if (!isEvmChain(chain) || !address) throw new Error(`Escrow not deployed on ${chain}`);
    return { chain, address, client: (this.deps.publicClient ?? defaultPublicClient)(chain) };
  }

  private async signer<T>(chain: EvmChainKey, reason: string, fn: (w: ReturnType<typeof createWalletClient>, account: ReturnType<typeof privateKeyToAccount>) => Promise<T>) {
    if (!(await this.deps.authorize(reason))) throw new AuthorizationDenied();
    return this.deps.withKey(async (pk) => {
      const account = privateKeyToAccount(pk);
      const w = createWalletClient({ account, chain: VIEM_CHAINS[chain], transport: fallback(CHAINS[chain].rpcUrls.map((u) => http(u))) });
      return fn(w, account);
    });
  }

  /** simulate → send → wait; reverts surface before anything is signed+broadcast. */
  private async write(chain: ChainKey, reason: string, functionName: string, args: readonly unknown[], value?: bigint): Promise<TxResult & { result?: unknown }> {
    const { address, client, chain: c } = this.ctx(chain);
    return this.signer(c as EvmChainKey, reason, async (w, account) => {
      const { request, result } = await client.simulateContract({ address, abi: milestoneEscrowAbi, functionName, args, value, account } as never);
      const hash = await w.writeContract(request as never);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`${functionName} reverted (${hash})`);
      return { hash, result, receipt } as never;
    });
  }

  async createEscrow(p: CreateEscrowParams) {
    if (p.amounts.length < 1 || p.amounts.length > 50) throw new Error('1–50 milestones required');
    if (p.amounts.some((a) => a <= 0n)) throw new Error('Milestone amounts must be > 0');
    const { client } = this.ctx(p.chain);
    const r = (await this.write(p.chain, 'Create escrow', 'createEscrow', [p.provider, p.arbiter, p.token, p.amounts, BigInt(p.reviewPeriod), BigInt(p.deadline)])) as TxResult & { result?: bigint; receipt?: { logs: never[] } };
    let escrowId = r.result as bigint | undefined;
    const receipt = r.receipt ?? (await client.getTransactionReceipt({ hash: r.hash }));
    const ev = parseEventLogs({ abi: milestoneEscrowAbi, eventName: 'EscrowCreated', logs: receipt.logs });
    if (ev[0]) escrowId = ev[0].args.escrowId;
    if (escrowId === undefined) throw new Error('EscrowCreated event missing');
    return { hash: r.hash, escrowId };
  }

  async fund(chain: ChainKey, escrowId: bigint) {
    const { address, client } = this.ctx(chain);
    const e = await this.getEscrow(chain, escrowId);
    if (!e) throw new Error('Escrow not found');
    if (e.token === NATIVE_TOKEN) return this.write(chain, 'Fund escrow', 'fund', [escrowId], e.total);
    // ERC-20: one biometric prompt covers approve (if needed) + fund.
    return this.signer(chain as EvmChainKey, 'Fund escrow', async (w, account) => {
      const allowance = await client.readContract({ address: e.token, abi: erc20Abi, functionName: 'allowance', args: [account.address, address] });
      if (allowance < e.total) {
        const { request } = await client.simulateContract({ address: e.token, abi: erc20Abi, functionName: 'approve', args: [address, e.total], account });
        const h = await w.writeContract(request as never);
        const rc = await client.waitForTransactionReceipt({ hash: h });
        if (rc.status !== 'success') throw new Error('USDC approve reverted');
      }
      const { request } = await client.simulateContract({ address, abi: milestoneEscrowAbi, functionName: 'fund', args: [escrowId], account });
      const hash = await w.writeContract(request as never);
      const rc = await client.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error(`fund reverted (${hash})`);
      return { hash };
    });
  }

  cancel = (chain: ChainKey, id: bigint) => this.write(chain, 'Cancel escrow', 'cancel', [id]);
  approveMilestone = (chain: ChainKey, id: bigint, index: number) => this.write(chain, 'Approve milestone', 'approveMilestone', [id, BigInt(index)]);
  refundExpired = (chain: ChainKey, id: bigint) => this.write(chain, 'Refund expired escrow', 'refundExpired', [id]);
  submitMilestone = (chain: ChainKey, id: bigint, index: number) => this.write(chain, 'Submit milestone', 'submitMilestone', [id, BigInt(index)]);
  claimAfterReview = (chain: ChainKey, id: bigint, index: number) => this.write(chain, 'Claim milestone', 'claimAfterReview', [id, BigInt(index)]);
  providerRefund = (chain: ChainKey, id: bigint) => this.write(chain, 'Refund client', 'providerRefund', [id]);
  raiseDispute = (chain: ChainKey, id: bigint) => this.write(chain, 'Raise dispute', 'raiseDispute', [id]);
  resolveDispute = (chain: ChainKey, id: bigint, bps: number) => {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) return Promise.reject(new Error('providerShareBps must be 0–10000'));
    return this.write(chain, 'Resolve dispute', 'resolveDispute', [id, bps]);
  };
  resolveAfterArbiterTimeout = (chain: ChainKey, id: bigint) => this.write(chain, 'Resolve after timeout', 'resolveAfterArbiterTimeout', [id]);
  withdraw = (chain: ChainKey, token: Hex) => this.write(chain, 'Withdraw funds', 'withdraw', [token]);

  async signApproval(chain: ChainKey, escrowId: bigint, index: number, sigDeadline: number): Promise<ApprovalSignature> {
    const { address } = this.ctx(chain);
    const e = await this.getEscrow(chain, escrowId);
    const m = e?.milestones[index];
    if (!m) throw new Error('Milestone not found');
    const typed = approvalTypedData(chain as EvmChainKey, address, { escrowId, index, amount: m.amount, sigDeadline });
    if (!(await this.deps.authorize('Sign milestone approval'))) throw new AuthorizationDenied();
    const signature = await this.deps.withKey((pk) => privateKeyToAccount(pk).signTypedData(typed));
    return { escrowId, index, amount: m.amount, sigDeadline, signature };
  }

  approveMilestoneWithSig = (chain: ChainKey, s: ApprovalSignature) =>
    this.write(chain, 'Relay approval', 'approveMilestoneWithSig', [s.escrowId, BigInt(s.index), BigInt(s.sigDeadline), s.signature]);

  async withdrawable(chain: ChainKey, account: Hex, token: Hex) {
    const { address, client } = this.ctx(chain);
    return client.readContract({ address, abi: milestoneEscrowAbi, functionName: 'withdrawable', args: [account, token] });
  }

  async getEscrow(chain: ChainKey, escrowId: bigint) {
    const { address, client } = this.ctx(chain);
    const [e, ms] = await Promise.all([
      client.readContract({ address, abi: milestoneEscrowAbi, functionName: 'getEscrow', args: [escrowId] }),
      client.readContract({ address, abi: milestoneEscrowAbi, functionName: 'getMilestones', args: [escrowId] }),
    ]);
    return mapEscrow(chain, escrowId, e as RawEscrow, ms as readonly RawMilestone[]);
  }

  /** Scans the newest ids via multicall — no log-range limits on public RPCs. */
  async listForAccount(chain: ChainKey, account: Hex) {
    const { address, client } = this.ctx(chain);
    const next = await client.readContract({ address, abi: milestoneEscrowAbi, functionName: 'nextEscrowId' });
    const limit = BigInt(this.deps.scanLimit ?? 200);
    const ids: bigint[] = [];
    for (let i = next - 1n; i >= 1n && BigInt(ids.length) < limit; i--) ids.push(i);
    if (!ids.length) return [];
    const res = await client.multicall({
      allowFailure: true,
      contracts: ids.map((id) => ({ address, abi: milestoneEscrowAbi, functionName: 'getEscrow', args: [id] }) as const),
    });
    const me = account.toLowerCase();
    const mine = ids.filter((_, k) => {
      const e = res[k].result as RawEscrow | undefined;
      return e && [e.client, e.provider, e.arbiter].some((a) => a.toLowerCase() === me);
    });
    return (await Promise.all(mine.map((id) => this.getEscrow(chain, id)))).filter((x): x is Escrow => !!x);
  }
}

export const escrowDeployBlock = (chain: ChainKey) => ESCROW_DEPLOYMENTS[chain]?.deployBlock;
