import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';

import { TOKENS } from '@/config/tokens';
import { isValidSolanaAddress, slip10Ed25519 } from '@/crypto/solana';
import { classifyIncoming, looksLikePoisoning } from '@/lib/spam';
import { createRequestDeduper } from '@/walletconnect/dedupe';
import { dappTxRecord } from '@/walletconnect/history';

const ME = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const OTHER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('SLIP-0010 ed25519', () => {
  it('matches the SLIP-0010 spec test vector 1 (m/0H)', () => {
    const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
    expect(Buffer.from(slip10Ed25519(seed, "m/0'")).toString('hex')).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3');
  });
  it('rejects non-hardened paths', () => {
    expect(() => slip10Ed25519(new Uint8Array(16), "m/44'/501'/0'/0")).toThrow();
  });
  it('validates Solana addresses', () => {
    expect(isValidSolanaAddress('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk')).toBe(true);
    expect(isValidSolanaAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false);
  });
});

describe('WC request de-duplication', () => {
  it('drops redelivered ids and identical payloads inside the window', () => {
    let t = 0;
    const seen = createRequestDeduper(5000, () => t);
    const r = { id: 1, topic: 'a', method: 'personal_sign', params: ['0x01', ME], chainId: 'eip155:11155111' };
    expect(seen(r)).toBe(false);
    expect(seen(r)).toBe(true); // same id
    expect(seen({ ...r, id: 2 })).toBe(true); // same payload, 0 s later
    t = 6000;
    expect(seen({ ...r, id: 3 })).toBe(false); // window passed
    expect(seen({ ...r, id: 4, params: ['0x02', ME] })).toBe(false); // different payload
    expect(seen({ ...r, id: 1, topic: 'b' })).toBe(false); // ids are per-topic
  });
});

describe('dApp tx → history record', () => {
  const rec = (data?: `0x${string}`, to = USDC, value?: string) =>
    dappTxRecord('sepolia', 'ETH', { from: ME, to, data, value }, '0xh', ME, TOKENS, 1, 'Demo dApp');
  it('decodes known-token transfer into a token amount', () => {
    const r = rec(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [OTHER, 2_500_000n] }));
    expect(r).toMatchObject({ kind: 'send', symbol: 'USDC', decimals: 6, amount: '2500000', to: OTHER, tokenAddress: USDC, dapp: 'Demo dApp' });
  });
  it('labels approvals (unlimited) and unknown calls', () => {
    expect(rec(encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [OTHER, maxUint256] }))).toMatchObject({ kind: 'contract', label: 'Approve UNLIMITED USDC', to: OTHER });
    expect(rec(encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [OTHER, 1_000_000n] })).label).toBe('Approve 1 USDC');
    expect(rec('0xdeadbeef', OTHER)).toMatchObject({ kind: 'contract', label: 'Contract call 0xdeadbeef' });
  });
  it('plain value transfer stays a native send', () => {
    expect(rec(undefined, OTHER, '0x2386f26fc10000')).toMatchObject({ kind: 'send', symbol: 'ETH', amount: '10000000000000000' });
  });
});

describe('spam classification', () => {
  const base = { chain: 'sepolia', tokenAddress: USDC, symbol: 'USDC', amount: '1000000', from: OTHER, to: ME };
  it('known tokens and native are ok', () => {
    expect(classifyIncoming(base, TOKENS).level).toBe('ok');
    expect(classifyIncoming({ ...base, tokenAddress: 'native', symbol: 'ETH' }, TOKENS).level).toBe('ok');
  });
  it('unknown tokens are unverified', () => {
    expect(classifyIncoming({ ...base, tokenAddress: '0x0000000000000000000000000000000000000abc', symbol: 'FOO' }, TOKENS).level).toBe('unverified');
  });
  it.each([
    [{ symbol: 'Visit usdc-claim.xyz' }, /link|bait/],
    [{ symbol: 'USDC' }, /impersonates USDC/],
    [{ symbol: 'UЅDC' }, /non-ASCII/],
    [{ amount: '0', symbol: 'FOO' }, /zero-value/],
  ])('flags spam %p', (o, re) => {
    const v = classifyIncoming({ ...base, tokenAddress: '0x0000000000000000000000000000000000000abc', ...o }, TOKENS);
    expect(v.level).toBe('spam');
    expect(v.reasons.join(' ')).toMatch(re);
  });
  it('detects address poisoning look-alikes', () => {
    expect(looksLikePoisoning('0x9858aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaada94', ME)).toBe(true);
    expect(looksLikePoisoning(OTHER, ME)).toBe(false);
    expect(looksLikePoisoning(ME, ME)).toBe(false);
  });
});
