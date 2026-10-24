import { MemoryKV } from '@/vault/storage';
import { KEYS, Vault, WrongPinError } from '@/vault/vault';

const FAST = { N: 2 ** 4, r: 8, p: 1 };
const secret = { kind: 'mnemonic' as const, mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' };

describe('Vault', () => {
  it('encrypts, never stores plaintext/PIN, and unlocks with PIN', async () => {
    const kv = new MemoryKV();
    const v = new Vault(kv, FAST);
    await v.create(secret, '123456');
    const raw = (await kv.get(KEYS.blob))!;
    expect(raw).not.toContain('abandon');
    expect(raw).not.toContain('123456');
    expect(await v.unlockWithPin('123456')).toEqual(secret);
  });
  it('rejects wrong PIN and counts attempts', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '123456');
    await expect(v.unlockWithPin('000000')).rejects.toBeInstanceOf(WrongPinError);
    await expect(v.unlockWithPin('000000')).rejects.toMatchObject({ attemptsLeft: 8 });
    expect(await v.unlockWithPin('123456')).toEqual(secret);
  });
  it('biometric path decrypts via stored KEK', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '123456', { biometrics: true });
    expect(await v.unlockWithBiometrics()).toEqual(secret);
  });
  it('rejects non-6-digit PINs', async () => {
    await expect(new Vault(new MemoryKV(), FAST).create(secret, '12')).rejects.toThrow();
  });
});
