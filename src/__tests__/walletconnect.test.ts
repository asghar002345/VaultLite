import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeFunctionData, erc20Abi, maxUint256, recoverMessageAddress, recoverTypedDataAddress, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { tronAddressFromPrivateKey } from '@/crypto/tron';
import type { TronTxLike } from '@/crypto/tron-sign';
import { signTronMessage, signTronTxObject, summarizeTronTx, tronHexToBase58 } from '@/crypto/tron-sign';
import { parseEip681Number, parseScan } from '@/lib/scan';
import { mapBlockscout, mapTronGrid } from '@/services/incoming';
import { decodeCalldata, decodePersonalMessage, typedDataRisks, typedDataTree } from '@/walletconnect/decode';
import { RPC_ERRORS } from '@/walletconnect/errors';
import { executeRequest } from '@/walletconnect/execute';
import { analyzeRequest, verifyRisks, type RequestInput } from '@/walletconnect/requests';

const PK = `0x${'11'.repeat(32)}` as const;
const EVM = privateKeyToAccount(PK).address;
const TRON = tronAddressFromPrivateKey(Buffer.from('11'.repeat(32), 'hex'));
const SPENDER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const SEPOLIA = 'eip155:11155111';
const NILE = 'tron:0xcd8690dc';
const base: Omit<RequestInput, 'method' | 'params'> = {
  chainId: SEPOLIA,
  sessionChains: [SEPOLIA, 'eip155:84532'],
  evmAddress: EVM,
  tronAddress: TRON,
  verify: { validation: 'VALID', origin: 'https://app.example' },
};
const keys = { evm: PK, tron: PK };
const typed = {
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
    Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
  },
  primaryType: 'Permit',
  domain: { name: 'USDC', version: '2', chainId: 11155111, verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
  message: { owner: EVM, spender: SPENDER, value: maxUint256.toString(), nonce: '0', deadline: '9999999999' },
};

describe('analyzeRequest — errors', () => {
  it('rejects unsupported methods with 4200 (incl. eth_sign)', () => {
    for (const m of ['eth_sign', 'eth_signTransaction', 'wallet_addEthereumChain', 'foo']) {
      expect(analyzeRequest({ ...base, method: m, params: [] })).toMatchObject({ kind: 'error', error: { code: 4200 } });
    }
  });
  it('rejects chains outside the session (4901) and unknown chains (4902)', () => {
    expect(analyzeRequest({ ...base, chainId: 'eip155:97', method: 'personal_sign', params: ['0x00', EVM] })).toMatchObject({ error: { code: 4901 } });
    expect(analyzeRequest({ ...base, chainId: 'eip155:1', method: 'personal_sign', params: ['0x00', EVM] })).toMatchObject({ error: { code: 4902 } });
  });
  it('rejects requests for a different account with 4100', () => {
    expect(analyzeRequest({ ...base, method: 'personal_sign', params: ['0x00', SPENDER] })).toMatchObject({ error: { code: 4100 } });
  });
  it('rejects typed-data chainId mismatch', () => {
    const bad = { ...typed, domain: { ...typed.domain, chainId: 1 } };
    const a = analyzeRequest({ ...base, method: 'eth_signTypedData_v4', params: [EVM, JSON.stringify(bad)] });
    expect(a).toMatchObject({ kind: 'error', error: { code: RPC_ERRORS.invalidParams.code, message: expect.stringMatching(/chainId mismatch/) } });
  });
  it('rejects tx chainId mismatch and contract deployment', () => {
    expect(analyzeRequest({ ...base, method: 'eth_sendTransaction', params: [{ from: EVM, to: SPENDER, value: '0x1', chainId: '0x14a34' }] })).toMatchObject({
      error: { message: expect.stringMatching(/chainId mismatch/) },
    });
    expect(analyzeRequest({ ...base, method: 'eth_sendTransaction', params: [{ from: EVM, data: '0x6000' }] })).toMatchObject({ error: { code: 4200 } });
  });
  it('wallet_switchEthereumChain: unknown → 4902, approved → switch', () => {
    expect(analyzeRequest({ ...base, method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })).toMatchObject({ error: { code: 4902 } });
    expect(analyzeRequest({ ...base, method: 'wallet_switchEthereumChain', params: [{ chainId: '0x61' }] })).toMatchObject({ error: { code: 4901 } });
    expect(analyzeRequest({ ...base, method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] })).toMatchObject({ kind: 'switch_chain', target: { key: 'baseSepolia' } });
  });
});

describe('risk hints', () => {
  it('flags unlimited approve and shows bounded approvals as info', () => {
    const unl = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, maxUint256] });
    const a = analyzeRequest({ ...base, method: 'eth_sendTransaction', params: [{ from: EVM, to: SPENDER, data: unl }] });
    expect(a.kind === 'send_tx' && a.risks.some((r) => r.level === 'danger' && /Unlimited/.test(r.text))).toBe(true);
    const d = decodeCalldata(encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, 5_000_000n] }), { symbol: 'USDC', decimals: 6 });
    expect(d.functionName).toBe('approve');
    expect(d.args.find((x) => x.name === 'amount')!.value).toBe('5 USDC');
    expect(d.risks[0].level).toBe('info');
  });
  it('decodes transfer and warns on unknown selectors', () => {
    const d = decodeCalldata(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [SPENDER, 1n] }));
    expect(d).toMatchObject({ functionName: 'transfer', risks: [] });
    expect(decodeCalldata('0xdeadbeef00').risks[0].level).toBe('warning');
  });
  it('maps Verify API states', () => {
    expect(verifyRisks({ validation: 'VALID' })).toEqual([]);
    expect(verifyRisks({ validation: 'UNKNOWN' })[0].level).toBe('warning');
    expect(verifyRisks({ validation: 'INVALID', origin: 'https://evil.example' })[0]).toMatchObject({ level: 'danger' });
    expect(verifyRisks({ validation: 'VALID', isScam: true })[0].level).toBe('danger');
    expect(verifyRisks(undefined)[0].level).toBe('warning');
  });
  it('flags unlimited Permit typed data and renders a tree', () => {
    expect(typedDataRisks(typed as never)[0]).toMatchObject({ level: 'danger' });
    const tree = typedDataTree({ a: 1, b: { c: [true, 'x'] } });
    expect(tree).toEqual([
      { depth: 0, label: 'message' },
      { depth: 1, label: 'a', value: '1' },
      { depth: 1, label: 'b' },
      { depth: 2, label: 'c' },
      { depth: 3, label: '[0]', value: 'true' },
      { depth: 3, label: '[1]', value: 'x' },
    ]);
  });
  it('shows personal_sign hex as text when printable', () => {
    expect(decodePersonalMessage(stringToHex('Sign in to app'))).toEqual({ text: 'Sign in to app', isHex: false });
    expect(decodePersonalMessage('0xff00ff').isHex).toBe(true);
  });
});

describe('execution (signatures recover to our account)', () => {
  it('personal_sign', async () => {
    const msg = stringToHex('hello');
    const a = analyzeRequest({ ...base, method: 'personal_sign', params: [msg, EVM] });
    const sig = (await executeRequest(a as never, keys)) as `0x${string}`;
    expect(await recoverMessageAddress({ message: 'hello', signature: sig })).toBe(EVM);
  });
  it('eth_signTypedData_v4', async () => {
    const a = analyzeRequest({ ...base, method: 'eth_signTypedData_v4', params: [EVM, JSON.stringify(typed)] });
    expect(a.kind).toBe('typed_data');
    const sig = (await executeRequest(a as never, keys)) as `0x${string}`;
    const { EIP712Domain: _d, ...types } = typed.types;
    void _d;
    expect(await recoverTypedDataAddress({ domain: typed.domain as never, types, primaryType: 'Permit', message: typed.message as never, signature: sig })).toBe(EVM);
  });
  it('tron_signMessage matches TronWeb signMessageV2 (vector)', () => {
    expect(TRON).toBe('TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ');
    expect(signTronMessage('hello VaultLite', PK)).toBe(
      '0xdad38d7a876ac2156a218afcc1d70e922ef461a9cafae22378dcf274f2cf6c562f32f1550a4c1fdf8ae427117dc61bcd7899753ef6ea728ecc177a4fef7d8d461b',
    );
  });
  it('tron_signTransaction: verifies txID, owner and both param formats', () => {
    const ownerHex = '41' + Buffer.from(base58.decode(TRON)).subarray(1, 21).toString('hex');
    const raw_data_hex = '0a02abcd2208' + 'ab'.repeat(8);
    const tx: TronTxLike = {
      txID: bytesToHex(sha256(Buffer.from(raw_data_hex, 'hex'))),
      raw_data_hex,
      raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: ownerHex, to_address: ownerHex, amount: 1_000_000 } } }] },
    };
    const nile = { ...base, chainId: NILE, sessionChains: [NILE] };
    const v1 = analyzeRequest({ ...nile, method: 'tron_signTransaction', params: { address: TRON, transaction: tx } });
    const legacy = analyzeRequest({ ...nile, method: 'tron_signTransaction', params: { address: TRON, transaction: { transaction: tx } } });
    expect(v1).toMatchObject({ kind: 'tron_sign_tx', legacy: false, summary: { type: 'TransferContract', amountSun: '1000000', to: TRON } });
    expect(legacy).toMatchObject({ kind: 'tron_sign_tx', legacy: true });
    expect(signTronTxObject(tx, PK).signature![0]).toHaveLength(130);
    const tampered = { ...tx, txID: '00'.repeat(32) };
    expect(analyzeRequest({ ...nile, method: 'tron_signTransaction', params: { address: TRON, transaction: tampered } })).toMatchObject({ error: { code: -32602 } });
    expect(summarizeTronTx(tx).owner).toBe(TRON);
    expect(tronHexToBase58(ownerHex)).toBe(TRON);
  });
});

describe('EIP-681 token transfer QR', () => {
  const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  it('parses ethereum:<token>@chain/transfer?address=&uint256=', () => {
    expect(parseScan(`ethereum:${USDC}@11155111/transfer?address=${SPENDER.toLowerCase()}&uint256=2.5e6`)).toEqual({
      kind: 'address', family: 'evm', address: SPENDER, chainId: 11155111, chainKey: 'sepolia', tokenAddress: USDC, amount: '2500000',
    });
  });
  it('rejects bad recipients/amounts and mainnet', () => {
    expect(parseScan(`ethereum:${USDC}@11155111/transfer?address=0x123&uint256=1`).kind).toBe('unknown');
    expect(parseScan(`ethereum:${USDC}@11155111/transfer?address=${SPENDER}&uint256=1.5`).kind).toBe('unknown');
    expect(parseScan(`ethereum:${USDC}@1/transfer?address=${SPENDER}&uint256=1`).kind).toBe('unknown');
  });
  it('parses EIP-681 numbers', () => {
    expect(parseEip681Number('1e18')).toBe('1000000000000000000');
    expect(parseEip681Number('2.014e18')).toBe('2014000000000000000');
    expect(parseEip681Number('0x10')).toBe('16');
    expect(parseEip681Number(null)).toBeUndefined();
    expect(parseEip681Number('abc')).toBe('invalid');
  });
});

describe('incoming transfer mapping', () => {
  it('Blockscout: keeps only inbound, non-self, successful, non-zero', () => {
    const me = EVM;
    const out = mapBlockscout(
      'sepolia',
      me,
      [
        { hash: '0x1', timestamp: '2026-10-01T00:00:00Z', value: '5', result: 'success', from: { hash: SPENDER }, to: { hash: me.toLowerCase() } },
        { hash: '0x2', timestamp: '2026-10-01T00:00:00Z', value: '0', result: 'success', from: { hash: SPENDER }, to: { hash: me } },
        { hash: '0x3', timestamp: '2026-10-01T00:00:00Z', value: '5', result: 'error', from: { hash: SPENDER }, to: { hash: me } },
        { hash: '0x4', timestamp: '2026-10-01T00:00:00Z', value: '5', from: { hash: me }, to: { hash: me } },
      ],
      [{ transaction_hash: '0x9', log_index: 3, timestamp: '2026-10-02T00:00:00Z', from: { hash: SPENDER }, to: { hash: me }, total: { value: '1000000', decimals: '6' }, token: { address_hash: '0xT', symbol: 'USDC', decimals: '6' } }],
    );
    expect(out.map((x) => x.id)).toEqual(['sepolia:0x1:native', 'sepolia:0x9:3']);
    expect(out[1]).toMatchObject({ symbol: 'USDC', decimals: 6, amount: '1000000' });
  });
  it('TronGrid: native TransferContract to us + TRC-20', () => {
    const meHex = '41' + Buffer.from(base58.decode(TRON)).subarray(1, 21).toString('hex');
    const out = mapTronGrid(
      TRON,
      [{ txID: 'aa', block_timestamp: 1, ret: [{ contractRet: 'SUCCESS' }], raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { amount: 7, owner_address: '41' + '00'.repeat(19) + '01', to_address: meHex } } }] } }],
      [{ transaction_id: 'bb', token_info: { symbol: 'USDT', address: 'TX', decimals: 6 }, block_timestamp: 2, from: 'TOTHER', to: TRON, value: '9', type: 'Transfer' }],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ symbol: 'TRX', amount: '7', to: TRON });
    expect(out[1]).toMatchObject({ symbol: 'USDT', amount: '9' });
  });
});
