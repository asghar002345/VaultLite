import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hexToBytes } from '@noble/hashes/utils.js';

import { CHAINS, EVM_CHAINS } from '@/config/chains';
import { signTronTx } from '@/services/tron';
import { supportedNamespaces } from '@/walletconnect/namespaces';

it('signs a Tron txID as r‖s‖v (v = 27/28) recoverable to the signer', () => {
  const pk = `0x${'11'.repeat(32)}` as const;
  const txID = 'ab'.repeat(32);
  const sig = signTronTx({ txID, raw_data: {}, raw_data_hex: '' }, pk).signature![0];
  expect(sig).toHaveLength(130);
  const v = parseInt(sig.slice(128), 16);
  expect([27, 28]).toContain(v);
  const recovered = secp256k1.Signature.fromHex(sig.slice(0, 128)).addRecoveryBit(v - 27).recoverPublicKey(hexToBytes(txID));
  expect(recovered.toHex(true)).toBe(Buffer.from(secp256k1.getPublicKey(hexToBytes(pk.slice(2)), true)).toString('hex'));
});

it('WalletConnect namespaces expose testnets only, with CAIP-10 accounts', () => {
  const ns = supportedNamespaces('0xabc', 'Tabc');
  expect(ns.eip155.chains).toEqual(EVM_CHAINS.map((c) => c.caip2));
  expect(ns.eip155.accounts[0]).toBe('eip155:11155111:0xabc');
  expect(ns.tron.accounts).toEqual(['tron:0xcd8690dc:Tabc']);
  expect(CHAINS.tronNile.caip2).toBe('tron:0xcd8690dc');
});
