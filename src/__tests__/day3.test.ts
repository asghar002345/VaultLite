import { TOKENS } from '@/config/tokens';
import { humanizeError } from '@/lib/errors';
import { bumpFees, REPLACEMENT_BUMP_PCT, tronFeeSun, tronTxBandwidth } from '@/lib/fees';
import { parseScan } from '@/lib/scan';
import { mergeTokens } from '@/store/custom-tokens';
import { addTx, canReplace, MAX_HISTORY, pendingTxs, settleTx, type TxRecord } from '@/store/history-core';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ADDR = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const TRON = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

describe('parseScan', () => {
  it('accepts a complete WalletConnect v2 URI', () => {
    const uri = 'wc:7f6e504bfad60b485450578e05678ed3e8e8c4751d3c6160be17160d63ec90f9@2?relay-protocol=irn&symKey=587d5484ce2a2a6ee3ba1962fdd7e8588e06200c46823bd18fbd67def96ad303';
    expect(parseScan(uri)).toEqual({ kind: 'wc', uri });
  });
  it('rejects incomplete / v1 WalletConnect URIs', () => {
    expect(parseScan('wc:abc@2?relay-protocol=irn').kind).toBe('unknown');
    expect(parseScan('wc:00e46b69-d0cc-4b3e-b6a2-cee442f97188@1?bridge=x&key=y').kind).toBe('unknown');
  });
  it('parses bare EVM addresses (normalizing case) and Tron addresses', () => {
    expect(parseScan(ADDR.toLowerCase())).toEqual({ kind: 'address', family: 'evm', address: ADDR });
    expect(parseScan(TRON)).toMatchObject({ kind: 'address', family: 'tron', address: TRON, chainKey: 'tronNile' });
  });
  it('parses EIP-681 with a testnet chain id and value', () => {
    expect(parseScan(`ethereum:${ADDR}@84532?value=1000000000000000`)).toEqual({
      kind: 'address', family: 'evm', address: ADDR, chainId: 84532, chainKey: 'baseSepolia', amount: '1000000000000000',
    });
  });
  it('rejects mainnet chain ids, function calls, bad checksums and junk', () => {
    expect(parseScan(`ethereum:${ADDR}@1`)).toMatchObject({ kind: 'unknown', reason: expect.stringMatching(/not a supported testnet/) });
    expect(parseScan(`ethereum:${ADDR}@11155111/transfer?address=${ADDR}`).kind).toBe('unknown');
    expect(parseScan('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD').kind).toBe('unknown');
    expect(parseScan('hello').kind).toBe('unknown');
  });
  it('parses tron: URIs with amount', () => {
    expect(parseScan(`tron:${TRON}?amount=5000000`)).toMatchObject({ kind: 'address', family: 'tron', amount: '5000000' });
  });
});

describe('humanizeError', () => {
  it.each([
    [{ shortMessage: 'The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.' }, /Not enough native/],
    [{ name: 'NonceTooLowError', message: 'nonce too low' }, /already used/],
    [new Error('replacement transaction underpriced'), /at least 10%/],
    [{ shortMessage: 'HTTP request failed.', details: 'fetch failed', message: 'URL: https://rpc.example/key123' }, /Could not reach/],
    [new Error('execution reverted: ERC20: transfer amount exceeds balance'), /reverted/],
    [new Error('BANDWITH_ERROR'), /bandwidth/],
    [new Error('TronGrid /wallet/getaccount HTTP 503'), /Could not reach/],
  ])('maps %p', (e, re) => expect(humanizeError(e)).toMatch(re));
  it('falls back to first line and strips URLs', () => {
    const m = humanizeError(new Error('weird thing at https://secret.example/abc\nstack...'));
    expect(m).toBe('weird thing at [rpc]');
  });
});

describe('bumpFees (replacement)', () => {
  const old = { maxFeePerGas: 1000n, maxPriorityFeePerGas: 100n };
  it('bumps both fields by 12.5% (rounded up), above the 10% txpool minimum', () => {
    const b = bumpFees(old);
    expect(b).toEqual({ maxFeePerGas: 1125n, maxPriorityFeePerGas: 113n });
    expect(b.maxFeePerGas * 100n >= old.maxFeePerGas * 110n).toBe(true);
    expect(REPLACEMENT_BUMP_PCT).toBe(1125n);
  });
  it('uses the market quote when it is higher', () => {
    expect(bumpFees(old, { maxFeePerGas: 5000n, maxPriorityFeePerGas: 50n })).toEqual({ maxFeePerGas: 5000n, maxPriorityFeePerGas: 113n });
  });
  it('keeps maxFee ≥ tip', () => {
    expect(bumpFees({ maxFeePerGas: 10n, maxPriorityFeePerGas: 10n }, { maxFeePerGas: 1n, maxPriorityFeePerGas: 500n })).toEqual({ maxFeePerGas: 500n, maxPriorityFeePerGas: 500n });
  });
});

describe('Tron fee estimate', () => {
  const prices = { sunPerBandwidth: 1000, sunPerEnergy: 210 };
  it('estimates signed size from raw_data_hex', () => expect(tronTxBandwidth(200)).toBe(234));
  it('is free when bandwidth and energy cover it', () => {
    expect(tronFeeSun(268, 0, { bandwidthLeft: 600, energyLeft: 0 }, prices).totalSun).toBe(0);
  });
  it('burns the FULL bandwidth when the free quota is short (all-or-nothing)', () => {
    expect(tronFeeSun(268, 0, { bandwidthLeft: 100, energyLeft: 0 }, prices)).toMatchObject({ bandwidthSun: 268_000, totalSun: 268_000 });
  });
  it('burns only the energy shortfall and adds activation', () => {
    const f = tronFeeSun(345, 64_285, { bandwidthLeft: 600, energyLeft: 10_000 }, prices, 1_100_000);
    expect(f.energySun).toBe(54_285 * 210);
    expect(f.totalSun).toBe(54_285 * 210 + 1_100_000);
  });
});

const tx = (o: Partial<TxRecord>): TxRecord => ({
  hash: '0x1', chain: 'sepolia', kind: 'send', from: ADDR, to: ADDR, tokenAddress: 'native', symbol: 'ETH', decimals: 18,
  amount: '1', status: 'pending', createdAt: 0, nonce: 7, ...o,
});

describe('history core', () => {
  it('prepends, dedupes and caps', () => {
    let l: TxRecord[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) l = addTx(l, tx({ hash: `0x${i}` }));
    l = addTx(l, tx({ hash: '0x3' }));
    expect(l).toHaveLength(MAX_HISTORY);
    expect(l[0].hash).toBe('0x3');
    expect(l.filter((t) => t.hash === '0x3')).toHaveLength(1);
  });
  it('links replacements and marks siblings replaced when one mines', () => {
    let l = addTx([], tx({ hash: '0xa' }));
    l = addTx(l, tx({ hash: '0xb', kind: 'speedup', replaces: '0xa' }));
    expect(l.find((t) => t.hash === '0xa')!.replacedBy).toBe('0xb');
    expect(canReplace(l, l.find((t) => t.hash === '0xa')!)).toBe(false);
    expect(canReplace(l, l.find((t) => t.hash === '0xb')!)).toBe(true);
    l = settleTx(l, '0xb', 'success', '123');
    expect(l.find((t) => t.hash === '0xb')).toMatchObject({ status: 'success', block: '123' });
    expect(l.find((t) => t.hash === '0xa')!.status).toBe('replaced');
    expect(pendingTxs(l)).toHaveLength(0);
  });
  it('does not touch other nonces / chains', () => {
    let l = addTx([], tx({ hash: '0xa' }));
    l = addTx(l, tx({ hash: '0xc', nonce: 8 }));
    l = addTx(l, tx({ hash: '0xd', chain: 'baseSepolia' }));
    l = settleTx(l, '0xa', 'success');
    expect(pendingTxs(l).map((t) => t.hash).sort()).toEqual(['0xc', '0xd']);
  });
});

it('custom tokens never override curated ones (case-insensitive)', () => {
  const fake = { ...TOKENS[1], address: TOKENS[1].address.toLowerCase(), symbol: 'FAKE', custom: true };
  const extra = { chain: 'sepolia' as const, address: '0x0000000000000000000000000000000000000001', symbol: 'X', name: 'X', decimals: 18, custom: true };
  const m = mergeTokens(TOKENS, [fake, extra]);
  expect(m).toHaveLength(TOKENS.length + 1);
  expect(m.some((t) => t.symbol === 'FAKE')).toBe(false);
});
