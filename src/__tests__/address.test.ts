import { validateAddress } from '@/lib/address';
import { tronAddressToAbiWord } from '@/services/tron';

const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'; // EIP-55 test vector

describe('EVM address validation', () => {
  it('accepts a valid EIP-55 checksum', () => {
    expect(validateAddress('evm', CHECKSUMMED)).toEqual({ ok: true, normalized: CHECKSUMMED });
  });
  it('accepts all-lowercase and normalizes to checksum', () => {
    expect(validateAddress('evm', CHECKSUMMED.toLowerCase())).toEqual({ ok: true, normalized: CHECKSUMMED });
  });
  it('rejects a mixed-case address with a bad checksum', () => {
    const bad = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD';
    expect(validateAddress('evm', bad)).toMatchObject({ ok: false, reason: expect.stringMatching(/checksum/i) });
  });
  it.each(['', '0x123', '5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xZZaeb6053F3E94C9b9A09f33669435E7Ef1BeAed'])('rejects %p', (a) => {
    expect(validateAddress('evm', a).ok).toBe(false);
  });
  it('rejects the zero address and trims whitespace', () => {
    expect(validateAddress('evm', `0x${'0'.repeat(40)}`).ok).toBe(false);
    expect(validateAddress('evm', `  ${CHECKSUMMED}\n`).ok).toBe(true);
  });
});

describe('Tron address validation', () => {
  const USDT_NILE = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
  it('accepts a valid base58check address', () => {
    expect(validateAddress('tron', USDT_NILE)).toEqual({ ok: true, normalized: USDT_NILE });
  });
  it('rejects a corrupted checksum', () => {
    expect(validateAddress('tron', USDT_NILE.slice(0, -1) + 'C').ok).toBe(false);
  });
  it('rejects EVM addresses and wrong prefixes', () => {
    expect(validateAddress('tron', CHECKSUMMED).ok).toBe(false);
    expect(validateAddress('tron', 'AXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf').ok).toBe(false);
    expect(validateAddress('evm', USDT_NILE).ok).toBe(false);
  });
  it('ABI-encodes a Tron address as a 32-byte word without the 0x41 prefix', () => {
    const w = tronAddressToAbiWord(USDT_NILE);
    expect(w).toHaveLength(64);
    expect(w.startsWith('0'.repeat(24))).toBe(true);
  });
});
