/* Live Base Sepolia read-only verification. Run: npx tsx scripts/verify-smart-account.ts */
import { createPublicClient, getAddress, hashMessage, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { accountFactoryAbi, ecdsaValidatorAbi } from '../src/modules/smartAccount/abis';
import { BASE_SEPOLIA_CONTRACTS as C, ENTRY_POINT_V07 } from '../src/modules/smartAccount/config';
import { accountMessageDigest, DEFAULT_SALT, encodeInitData } from '../src/modules/smartAccount/encoding';
import { VaultLiteSmartAccountProvider } from '../src/modules/smartAccount/VaultLiteSmartAccountProvider';

const ok = (b: boolean, m: string) => { console.log(`${b ? 'PASS' : 'FAIL'} ${m}`); if (!b) process.exitCode = 1; };

async function main() {
  const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
  // Public test mnemonic only — never a real seed.
  const owner = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 0 });
  const impl = await client.readContract({ address: C.accountFactory, abi: accountFactoryAbi, functionName: 'implementation' });
  const ep = await client.readContract({ address: C.accountFactory, abi: accountFactoryAbi, functionName: 'ENTRY_POINT' });
  ok(getAddress(impl) === getAddress(C.smartAccountImpl), `factory.implementation() = ${impl}`);
  ok(ep === ENTRY_POINT_V07, `factory.ENTRY_POINT() = ${ep}`);
  for (const [k, a] of Object.entries(C)) { const code = await client.getCode({ address: a }); ok(!!code && code.length > 2, `${k} has code (${((code?.length ?? 2) - 2) / 2} bytes)`); }
  const p = new VaultLiteSmartAccountProvider({ chain: 'baseSepolia', entryPoint: ENTRY_POINT_V07, factory: C.accountFactory, bundlerUrl: null }, client as never, owner);
  const addr = await p.getAddress();
  const raw = await client.call({ to: C.accountFactory, data: (await import('viem')).encodeFunctionData({ abi: accountFactoryAbi, functionName: 'getAddress', args: [encodeInitData(owner.address), DEFAULT_SALT] }) });
  ok(!!raw.data && getAddress(`0x${raw.data.slice(-40)}`) === addr, `counterfactual for ${owner.address}: ${addr} (raw eth_call agrees)`);
  const deployed = await p.isDeployed();
  console.log(`INFO deployed=${deployed} nonce(ECDSA key)=${await p.getNonce()}`);
  const h = hashMessage('vaultlite');
  const on = await client.readContract({ address: C.ecdsaOwnerValidator, abi: ecdsaValidatorAbi, functionName: 'accountMessageDigest', args: [addr, h] });
  ok(on === accountMessageDigest(addr, h, 84532), 'local EIP-712 account digest == validator.accountMessageDigest');
}
main().catch((e) => { console.error(e); process.exit(1); });
