import { decodeFunctionData, encodeFunctionData, getAddress, maxUint256, parseAbi, type Hex, type PublicClient } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { smartAccountAbi } from '@/modules/smartAccount/abis';
import {
  approvalCall,
  approvalWarning,
  BATCH_BUILD_OPTS,
  decodeExecuteCalls,
  decodeTokenApproval,
  parseApprovalAmount,
  reviewBatch,
  sendBatchUserOperation,
} from '@/modules/smartAccount/batch';
import { BundlerClient } from '@/modules/smartAccount/client';
import { ENTRY_POINT_V07, SMART_ACCOUNT_CONFIG } from '@/modules/smartAccount/config';
import { encodeExecute, encodeExecuteBatch, MODE_BATCH, MODE_SINGLE, predictAccountAddress } from '@/modules/smartAccount/encoding';
import { createMockBundler } from '@/modules/smartAccount/mock-bundler';
import { VaultLiteSmartAccountProvider } from '@/modules/smartAccount/VaultLiteSmartAccountProvider';
import {
  disconnectSessions,
  formatConnectedAt,
  connectedAtStorageKey,
  rememberConnectedAt,
  sessionsAfterDisconnect,
  toConnectedApp,
  topicsToDisconnect,
  type WalletSession,
} from '@/walletconnect/sessions-control';

const owner = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 0 });
const USDC: Hex = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const ESCROW: Hex = '0xD861488f2ba02df4047DDE41EFeCdCEd1FD6E528';
const SPENDER: Hex = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const URL = 'https://proxy.test/api/bundler/84532';

const fundData = encodeFunctionData({ abi: parseAbi(['function fund(uint256 id)']), functionName: 'fund', args: [1n] });

function fakeChain({ deployed = true } = {}) {
  return {
    chain: baseSepolia,
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      if (functionName === 'getAddress') return predictAccountAddress(args[0] as Hex, args[1] as Hex);
      if (functionName === 'getNonce') return (args[1] as bigint) << 64n;
      throw new Error(functionName);
    },
    getCode: async () => (deployed ? '0x6080' : undefined),
  } as unknown as PublicClient;
}

function provider(mock = createMockBundler({ expectSigner: owner.address })) {
  const p = new VaultLiteSmartAccountProvider({ ...SMART_ACCOUNT_CONFIG.baseSepolia!, bundlerUrl: URL }, fakeChain(), owner, {
    bundler: new BundlerClient(URL, 84532, ENTRY_POINT_V07, mock.fetcher),
  });
  return { p, mock };
}

describe('batch encoding', () => {
  const calls = [approvalCall(USDC, ESCROW, 5_000_000n), { to: ESCROW, value: 0n, data: fundData }];

  it('encodes approve + contract call as one execute in batch mode', () => {
    const data = encodeExecuteBatch(calls);
    const decoded = decodeFunctionData({ abi: smartAccountAbi, data });
    expect(decoded.functionName).toBe('execute');
    expect(decoded.args?.[0]).toBe(MODE_BATCH);
    const inner = decodeExecuteCalls(data);
    expect(inner.mode).toBe('batch');
    expect(inner.calls).toHaveLength(2);
    expect(getAddress(inner.calls[0].to)).toBe(getAddress(USDC));
    expect(inner.calls[0].data?.toLowerCase()).toBe(calls[0].data!.toLowerCase());
    expect(getAddress(inner.calls[1].to)).toBe(getAddress(ESCROW));
    expect(inner.calls[1].data?.toLowerCase()).toBe(fundData.toLowerCase());
    expect(encodeExecute(calls)).toBe(data);
  });

  it('keeps a one-call array in batch mode', () => {
    const one = [approvalCall(USDC, SPENDER, 1n)];
    const batched = decodeExecuteCalls(encodeExecuteBatch(one));
    const single = decodeExecuteCalls(encodeExecute(one));
    expect(batched.mode).toBe('batch');
    expect(batched.calls).toHaveLength(1);
    expect(getAddress(batched.calls[0].to)).toBe(getAddress(USDC));
    expect(single.mode).toBe('single');
    expect(getAddress(single.calls[0].to)).toBe(getAddress(USDC));
    expect(single.calls[0].value).toBe(0n);
    expect(single.calls[0].data?.toLowerCase()).toBe(one[0].data!.toLowerCase());
    expect(encodeExecute([{ to: owner.address, value: 1n }]).length).toBeGreaterThan(10);
    expect(decodeFunctionData({ abi: smartAccountAbi, data: encodeExecute([{ to: owner.address, value: 1n }]) }).args?.[0]).toBe(MODE_SINGLE);
  });

  it('rejects an empty batch', () => {
    expect(() => encodeExecuteBatch([])).toThrow(/No calls/);
  });

  it('sends one self-paid UserOp through the bundler proxy (no paymaster)', async () => {
    const mock = createMockBundler({ expectSigner: owner.address, notSponsorable: true });
    const { p } = provider(mock);
    const { userOpHash } = await sendBatchUserOperation(p, calls);
    expect(mock.methods().filter((m) => m.startsWith('pm_'))).toEqual([]);
    expect(mock.methods()).toEqual([
      'eth_supportedEntryPoints',
      'pimlico_getUserOperationGasPrice',
      'eth_estimateUserOperationGas',
      'eth_sendUserOperation',
    ]);
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].paymaster).toBeUndefined();
    expect(mock.sent[0].callData).toBe(encodeExecuteBatch(calls));
    expect(decodeExecuteCalls(mock.sent[0].callData).calls).toHaveLength(2);
    expect(userOpHash).toBe(p.userOpHash(mock.sent[0]));
    expect(BATCH_BUILD_OPTS).toEqual({ sponsor: false, batch: true });
  });

  it('quotes gas on the bundler proxy without paymaster or a signature', async () => {
    const { p, mock } = provider();
    const q = await p.quoteSelfPaid(calls, undefined, { batch: true });
    expect(mock.methods()).toEqual(['eth_supportedEntryPoints', 'pimlico_getUserOperationGasPrice', 'eth_estimateUserOperationGas']);
    expect(q.price.maxFeePerGas).toBe(0x124f80n);
    expect(q.totalGas).toBe(q.gas.callGasLimit + q.gas.verificationGasLimit + q.gas.preVerificationGas);
    expect(q.maxCostWei).toBe(q.totalGas * q.price.maxFeePerGas);
    expect(mock.sent).toHaveLength(0);
  });
});

describe('approval decoding', () => {
  it('shows spender and a formatted amount', () => {
    const call = approvalCall(USDC, SPENDER, 5_000_000n);
    const d = decodeTokenApproval(call);
    expect(d).toMatchObject({
      token: getAddress(USDC),
      spender: getAddress(SPENDER),
      amount: 5_000_000n,
      unlimited: false,
      amountLabel: '5 USDC',
      symbol: 'USDC',
    });
    expect(approvalWarning(d!)).toBeNull();
  });

  it('warns on unlimited approvals', () => {
    const call = approvalCall(USDC, SPENDER, maxUint256);
    const d = decodeTokenApproval(call);
    expect(d?.unlimited).toBe(true);
    expect(d?.amountLabel).toBe('Unlimited');
    expect(approvalWarning(d!)).toMatch(/Unlimited approval/);
    expect(approvalWarning(d!)).toContain(getAddress(SPENDER));
    expect(parseApprovalAmount('1', 6, true)).toBe(maxUint256);
  });

  it('lists every call in the batch, decoding only real approvals', () => {
    const rows = reviewBatch([
      approvalCall(USDC, ESCROW, maxUint256),
      { to: ESCROW, value: 0n, data: fundData },
      { to: SPENDER, value: 1n, data: '0x' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe('Approve USDC');
    expect(rows[0].approval?.spender).toBe(getAddress(ESCROW));
    expect(rows[0].warning).toMatch(/Unlimited/);
    expect(rows[1]).toMatchObject({ title: 'Contract call', approval: null, warning: null });
    expect(rows[1].detail).toBe(`Selector ${fundData.slice(0, 10)}`);
    expect(rows[2].title).toBe('Native transfer');
    expect(decodeTokenApproval({ to: USDC, data: fundData })).toBeNull();
    expect(decodeTokenApproval({ to: USDC, data: '0x095ea7b3' })).toBeNull();
  });

  it('parses bounded amounts including a zero revoke', () => {
    expect(parseApprovalAmount('2.5', 6, false)).toBe(2_500_000n);
    expect(parseApprovalAmount('0', 6, false)).toBe(0n);
    expect(parseApprovalAmount('', 6, false)).toBeNull();
    expect(parseApprovalAmount('1.1234567', 6, false)).toBeNull();
  });
});

describe('session disconnect', () => {
  const session = (topic: string, name: string): WalletSession => ({
    topic,
    expiry: 1_800_000_000,
    peer: { metadata: { name, url: `https://${name.toLowerCase()}.example/app`, icons: [`https://cdn.example/${topic}.png`, 'data:image/png;base64,xx'] } },
    namespaces: {
      eip155: { chains: ['eip155:84532', 'eip155:11155111'], accounts: [`eip155:84532:0x${'ab'.repeat(20)}`] },
      tron: { accounts: ['tron:0xcd8690dc:TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'] },
    },
  });

  it('describes name, icon, url, chains and connected time', () => {
    const app = toConnectedApp(session('topic-a', 'Demo'), 1_000);
    expect(app).toMatchObject({
      topic: 'topic-a',
      name: 'Demo',
      url: 'https://demo.example/app',
      icon: 'https://cdn.example/topic-a.png',
      chains: ['eip155:84532', 'eip155:11155111', 'tron:0xcd8690dc'],
      connectedAt: 1_000,
    });
    expect(formatConnectedAt(1_000, 1_000 + 5_000)).toBe('Just now');
    expect(formatConnectedAt(1_000, 1_000 + 120_000)).toBe('2m ago');
    expect(formatConnectedAt(1_000, 1_000 + 3 * 3600_000)).toBe('3h ago');
    expect(formatConnectedAt(1_000, 1_000 + 2 * 86400_000)).toBe('2d ago');
    const chainsOnly = toConnectedApp(
      { ...session('t', 'x'), peer: { metadata: { name: '  ', url: '', icons: ['not-a-url'] } }, namespaces: { eip155: { accounts: ['eip155:84532:0x1'] } } },
      null,
    );
    expect(chainsOnly.name).toBe('Unnamed dApp');
    expect(chainsOnly.chains).toEqual(['eip155:84532']);
    expect(chainsOnly.icon).toBeNull();
  });

  it('disconnects one session and leaves the rest', async () => {
    const live = [session('a', 'A'), session('b', 'B'), session('c', 'C')];
    const called: string[] = [];
    expect(topicsToDisconnect(live.map((s) => s.topic), 'b')).toEqual(['b']);
    const result = await disconnectSessions(['b'], async (topic) => {
      called.push(topic);
    });
    expect(called).toEqual(['b']);
    expect(result.disconnected).toEqual(['b']);
    expect(result.failed).toEqual([]);
    expect(sessionsAfterDisconnect(live, result.disconnected).map((s) => s.topic)).toEqual(['a', 'c']);
  });

  it('disconnect all visits every session and records a failure without stopping', async () => {
    const topics = ['a', 'b', 'c'];
    expect(topicsToDisconnect(topics, 'all')).toEqual(topics);
    const result = await disconnectSessions(topics, async (topic) => {
      if (topic === 'b') throw new Error('peer gone');
    });
    expect(result.disconnected).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ topic: 'b', message: 'peer gone' }]);
    expect(sessionsAfterDisconnect(topics.map((topic) => ({ topic })), result.disconnected)).toEqual([{ topic: 'b' }]);
  });

  it('remembers the first connected time and drops ended sessions', async () => {
    const mem = new Map<string, string>();
    const store = {
      get: async (k: string) => mem.get(k) ?? null,
      set: async (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    expect(await rememberConnectedAt(['a'], store, 1_000)).toEqual({ a: 1_000 });
    expect(await rememberConnectedAt(['a', 'b'], store, 5_000)).toEqual({ a: 1_000, b: 5_000 });
    expect(await rememberConnectedAt(['b'], store, 9_000)).toEqual({ b: 5_000 });
    expect(JSON.parse(mem.get(connectedAtStorageKey)!)).toEqual({ b: 5_000 });
  });
});
