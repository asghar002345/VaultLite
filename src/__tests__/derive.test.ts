import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { mnemonicToSeedSync } from '@scure/bip39';

import {
  deriveAccounts,
  evmAddressFromPrivateKey,
  evmPrivateKeyFromMnemonic,
  isValidMnemonic,
  isValidPrivateKey,
  tronPrivateKeyFromMnemonic,
} from '@/crypto/derive';
import { isValidTronAddress, tronAddressFromPrivateKey } from '@/crypto/tron';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-39 vectors', () => {
  it('seed of abandon…about with passphrase TREZOR matches official vector', () => {
    expect(bytesToHex(mnemonicToSeedSync(ABANDON, 'TREZOR'))).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    );
  });
  it('validates mnemonics and checksums', () => {
    expect(isValidMnemonic(ABANDON)).toBe(true);
    expect(isValidMnemonic('  ABANDON ' + ABANDON.slice(8) + ' ')).toBe(true);
    expect(isValidMnemonic(ABANDON.replace('about', 'abandon'))).toBe(false);
  });
});

describe('EVM m/44\'/60\'/0\'/0/x', () => {
  it('derives the well-known abandon…about addresses', () => {
    expect(evmAddressFromPrivateKey(evmPrivateKeyFromMnemonic(ABANDON, 0))).toBe(
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    );
    expect(evmAddressFromPrivateKey(evmPrivateKeyFromMnemonic(ABANDON, 1))).toBe(
      '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
    );
  });
  it('private key vector', () => {
    expect(evmPrivateKeyFromMnemonic(ABANDON, 0)).toBe(
      '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727',
    );
  });
});

describe('Tron m/44\'/195\'/0\'/0/0', () => {
  it('derives the known abandon…about Tron address', () => {
    const pk = tronPrivateKeyFromMnemonic(ABANDON);
    const addr = tronAddressFromPrivateKey(hexToBytes(pk.slice(2)));
    expect(addr).toBe('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
    expect(isValidTronAddress(addr)).toBe(true);
  });
  it('private key 1 → known Tron address', () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    // pubkey(1) = generator G; EVM address 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
    expect(tronAddressFromPrivateKey(one)).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC');
  });
  it('rejects bad checksums', () => {
    expect(isValidTronAddress('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdJ')).toBe(false);
  });
});

describe('deriveAccounts', () => {
  it('mnemonic secret', () => {
    const a = deriveAccounts({ kind: 'mnemonic', mnemonic: ABANDON });
    expect(a.evm.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    expect(a.tron.address).toBe('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');
    // Cross-checked with @solana/web3.js Keypair.fromSeed(ed25519-hd-key derivePath(...)).
    expect(a.solana.address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
    expect(deriveAccounts({ kind: 'mnemonic', mnemonic: ABANDON }, 1).solana.address).toBe('Hh8QwFUA6MtVu1qAoq12ucvFHNwCcVTV7hpWjeY1Hztb');
    expect(a.solana.path).toBe("m/44'/501'/0'/0'");
  });
  it('private-key secret maps same key to EVM and Tron', () => {
    const pk = '0x' + '0'.repeat(63) + '1';
    const a = deriveAccounts({ kind: 'privateKey', privateKey: pk });
    expect(a.evm.address).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
    expect(a.tron.address).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC');
    expect(isValidPrivateKey(pk)).toBe(true);
    expect(a.solana.address).toBeNull();
    expect(isValidPrivateKey('0x' + '0'.repeat(64))).toBe(false);
  });
});
