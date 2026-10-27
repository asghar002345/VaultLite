import { hashTypedData, recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { availableActions, getEscrowAddress, mapEscrow, ViemEscrowService, type Escrow, type Hex } from '@/modules/escrow';
import { approvalTypedData } from '@/modules/escrow/EscrowService.viem';

const ADDR = '0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528' as Hex;
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex; // well-known anvil test key
const ME = privateKeyToAccount(PK).address;
const P = '0x00000000000000000000000000000000000000b0' as Hex;
const A = '0x00000000000000000000000000000000000000a0' as Hex;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Hex;

const raw = (status: number, client: Hex = ME) => ({
  client, feeBps: 0, reviewPeriod: 3600n, status, provider: P, deadline: 2_000_000_000n, arbiter: A, disputedAt: 0n,
  token: USDC, total: 3_000_000n, settled: 0n, paidToProvider: 0n,
});
const ms = [ { amount: 1_000_000n, submittedAt: 0n, status: 0 }, { amount: 2_000_000n, submittedAt: 1000n, status: 1 } ];

function fakeClient(escrows: Record<string, ReturnType<typeof raw>>, next = 4n) {
  return {
    readContract: jest.fn(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
      if (functionName === 'nextEscrowId') return next;
      if (functionName === 'getEscrow') return escrows[String(args![0])] ?? raw(0);
      if (functionName === 'getMilestones') return escrows[String(args![0])] ? ms : [];
      if (functionName === 'withdrawable') return 42n;
      throw new Error(functionName);
    }),
    multicall: jest.fn(async ({ contracts }: { contracts: { args: [bigint] }[] }) =>
      contracts.map((c) => ({ status: 'success', result: escrows[String(c.args[0])] ?? raw(0) }))),
  };
}
const svc = (client: unknown, authorize = jest.fn(async () => true), withKey = jest.fn(async (fn: (pk: Hex) => Promise<unknown>) => fn(PK))) =>
  ({ s: new ViemEscrowService({ publicClient: () => client as never, authorize, withKey: withKey as never }), authorize, withKey });

describe('escrow deployment', () => {
  it('defaults to the verified Base Sepolia address', () => {
    expect(getEscrowAddress('baseSepolia')).toBe(ADDR);
    expect(getEscrowAddress('sepolia')).toBeNull();
  });
});

describe('approveBySig EIP-712', () => {
  const m = { escrowId: 7n, index: 2, amount: 1_500_000n, sigDeadline: 1_900_000_000 };
  it('matches the deployed contract approvalDigest (captured via eth_call)', () => {
    expect(hashTypedData(approvalTypedData('baseSepolia', ADDR, m))).toBe('0xb25f71516bf0226567710881df0c12190f69f3b7bf48355e5ebc0c750917187c');
  });
  it('signApproval gates on auth and recovers to the client', async () => {
    const { s, authorize } = svc(fakeClient({ '7': raw(2) }));
    const sig = await s.signApproval('baseSepolia', 7n, 1, m.sigDeadline);
    expect(authorize).toHaveBeenCalledWith('Sign milestone approval');
    expect(sig.amount).toBe(2_000_000n);
    const rec = await recoverTypedDataAddress({ ...approvalTypedData('baseSepolia', ADDR, { ...m, index: 1, amount: 2_000_000n }), signature: sig.signature });
    expect(rec).toBe(ME);
  });
  it('never touches the key when auth is denied', async () => {
    const { s, withKey } = svc(fakeClient({ '7': raw(2) }), jest.fn(async () => false));
    await expect(s.signApproval('baseSepolia', 7n, 0, 1)).rejects.toThrow('Authorization cancelled');
    await expect(s.cancel('baseSepolia', 7n)).rejects.toThrow('Authorization cancelled');
    expect(withKey).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('maps enums and treats status None as missing', () => {
    expect(mapEscrow('baseSepolia', 1n, raw(0), [])).toBeNull();
    const e = mapEscrow('baseSepolia', 1n, raw(2), ms)!;
    expect(e.status).toBe('Funded');
    expect(e.milestones.map((x) => x.status)).toEqual(['Pending', 'Submitted']);
  });
  it('listForAccount returns only escrows where I am a party', async () => {
    const { s } = svc(fakeClient({ '1': raw(2), '2': raw(1, P), '3': raw(1, '0x00000000000000000000000000000000000000c0') }));
    const r = await s.listForAccount('baseSepolia', ME);
    expect(r.map((e) => e.id)).toEqual([1n]);
    const asProvider = await s.listForAccount('baseSepolia', P);
    expect(asProvider.map((e) => e.id)).toEqual([3n, 2n, 1n]);
  });
  it('withdrawable passes through', async () => {
    expect(await svc(fakeClient({})).s.withdrawable('baseSepolia', ME, USDC)).toBe(42n);
  });
  it('validates inputs before prompting', async () => {
    const { s, authorize } = svc(fakeClient({}));
    await expect(s.resolveDispute('baseSepolia', 1n, 10_001)).rejects.toThrow('0–10000');
    await expect(s.createEscrow({ chain: 'baseSepolia', provider: P, arbiter: A, token: USDC, amounts: [], reviewPeriod: 3600, deadline: 1 })).rejects.toThrow('1–50');
    expect(authorize).not.toHaveBeenCalled();
    expect(s.isAvailable('tronNile')).toBe(false);
  });
});

describe('availableActions', () => {
  const e = (status: number, me = ME) => ({ e: mapEscrow('baseSepolia', 1n, raw(status), ms) as Escrow, me });
  it('client in Created can fund/cancel', () => {
    const { e: x } = e(1);
    expect(availableActions(x, ME, 0).map((a) => a.kind)).toEqual(['fund', 'cancel']);
  });
  it('provider can submit pending, claim after review, dispute', () => {
    const { e: x } = e(2);
    const k = availableActions(x, P, 1000 + 3600).map((a) => a.kind + ('index' in a ? a.index : ''));
    expect(k).toEqual(['submit0', 'claim1', 'dispute', 'providerRefund']);
    expect(availableActions(x, P, 1000).map((a) => a.kind)).not.toContain('claim');
  });
  it('client in Funded can approve and dispute; nothing once Completed', () => {
    const { e: x } = e(2);
    expect(availableActions(x, ME, 0).map((a) => a.kind)).toEqual(['approve', 'approve', 'dispute']);
    expect(availableActions(mapEscrow('baseSepolia', 1n, raw(7), ms)!, ME, 0)).toEqual([]);
  });
});
