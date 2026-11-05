import { DEFAULT_SETTINGS, parseSettings, resolveScheme, shouldAutoLock } from '@/store/settings-core';
import { Vault, WrongPinError } from '@/vault/vault';
import { MemoryKV } from '@/vault/storage';

const FAST = { N: 16, r: 1, p: 1 };
const secret = { kind: 'mnemonic' as const, mnemonic: 'test test test test test test test test test test test junk' };

describe('auto-lock timer', () => {
  it('never locks if the app never backgrounded', () => expect(shouldAutoLock(null, 1000, 0)).toBe(false));
  it('locks once the grace period has elapsed', () => {
    expect(shouldAutoLock(1000, 1000 + 29_999, 30_000)).toBe(false);
    expect(shouldAutoLock(1000, 1000 + 30_000, 30_000)).toBe(true);
  });
  it('0 ms locks on any return', () => expect(shouldAutoLock(5, 5, 0)).toBe(true));
  it('fails safe when the clock goes backwards', () => expect(shouldAutoLock(10_000, 5_000, 900_000)).toBe(true));
});

describe('settings parsing', () => {
  it('defaults on garbage', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
  });
  it('rejects unknown auto-lock values and themes', () => {
    const s = parseSettings(JSON.stringify({ theme: 'pink', autoLockMs: 12345, hiddenChains: ['sepolia', 3] }));
    expect(s.theme).toBe('system');
    expect(s.autoLockMs).toBe(0);
    expect(s.hiddenChains).toEqual(['sepolia']);
  });
  it('keeps valid values', () => {
    expect(parseSettings(JSON.stringify({ theme: 'light', autoLockMs: 60_000 })).autoLockMs).toBe(60_000);
  });
  it('resolves theme preference (dark-first)', () => {
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('PIN change / biometrics / reveal', () => {
  it('changes the PIN: old stops working, new works, secret intact', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '111111');
    await v.changePin('111111', '222222');
    await expect(v.unlockWithPin('111111')).rejects.toBeInstanceOf(WrongPinError);
    expect(await v.unlockWithPin('222222')).toEqual(secret);
  });
  it('rejects a wrong current PIN, an invalid or identical new PIN', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '111111');
    await expect(v.changePin('999999', '222222')).rejects.toBeInstanceOf(WrongPinError);
    await expect(v.changePin('111111', '12')).rejects.toThrow('6 digits');
    await expect(v.changePin('111111', '111111')).rejects.toThrow('differ');
    expect(await v.unlockWithPin('111111')).toEqual(secret);
  });
  it('keeps biometrics enabled across a PIN change and rewraps the key', async () => {
    const kv = new MemoryKV();
    const v = new Vault(kv, FAST);
    await v.create(secret, '111111', { biometrics: true });
    const before = await kv.get('vaultlite.biokek.v1');
    await v.changePin('111111', '333333');
    expect(await v.biometricsEnabled()).toBe(true);
    expect(await kv.get('vaultlite.biokek.v1')).not.toBe(before);
    expect(await v.unlockWithBiometrics()).toEqual(secret);
  });
  it('toggles biometrics with the PIN', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '111111');
    await v.setBiometrics('111111', true);
    expect(await v.biometricsEnabled()).toBe(true);
    await v.setBiometrics('111111', false);
    expect(await v.biometricsEnabled()).toBe(false);
    await expect(v.unlockWithBiometrics()).rejects.toThrow();
  });
  it('reveal requires the right PIN', async () => {
    const v = new Vault(new MemoryKV(), FAST);
    await v.create(secret, '111111');
    await expect(v.revealWithPin('000000')).rejects.toBeInstanceOf(WrongPinError);
    expect(await v.revealWithPin('111111')).toEqual(secret);
  });
});
