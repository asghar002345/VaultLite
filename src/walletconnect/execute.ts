import { createWalletClient, http, type TypedDataDefinition } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { signTronMessage, signTronTxObject } from '@/crypto/tron-sign';
import { padGas } from '@/lib/fees';
import { isEvmChain, publicClient, VIEM_CHAINS, marketFee } from '@/services/evm';

import type { Analysis } from './requests';

type Keys = { evm: `0x${string}`; tron: `0x${string}` };
const big = (v?: string) => (v !== undefined && v !== null && v !== '' ? BigInt(v) : undefined);

/** Perform an approved request. Returns the JSON-RPC result. */
export async function executeRequest(a: Exclude<Analysis, { kind: 'error' }>, keys: Keys): Promise<unknown> {
  switch (a.kind) {
    case 'personal_sign': {
      const acct = privateKeyToAccount(keys.evm);
      return a.display.isHex || a.message.startsWith('0x')
        ? acct.signMessage({ message: { raw: a.message as `0x${string}` } })
        : acct.signMessage({ message: a.message });
    }
    case 'typed_data': {
      const acct = privateKeyToAccount(keys.evm);
      const { EIP712Domain: _omit, ...types } = a.typedData.types; // viem derives the domain type itself
      void _omit;
      return acct.signTypedData({
        domain: a.typedData.domain as TypedDataDefinition['domain'],
        types,
        primaryType: a.typedData.primaryType,
        message: a.typedData.message,
      } as unknown as TypedDataDefinition);
    }
    case 'send_tx': {
      const key = Object.entries(VIEM_CHAINS).find(([, c]) => c.id === a.chain.chainId)?.[0];
      if (!key || !isEvmChain(key)) throw new Error('Unsupported chain');
      const account = privateKeyToAccount(keys.evm);
      const c = publicClient(key);
      const t = a.tx;
      const call = { to: t.to as `0x${string}`, value: big(t.value) ?? 0n, data: t.data };
      const gas = big(t.gas ?? t.gasLimit) ?? padGas(await c.estimateGas({ account: account.address, ...call }));
      const fee =
        t.maxFeePerGas && t.maxPriorityFeePerGas
          ? { maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) }
          : await marketFee(key);
      const wallet = createWalletClient({ account, chain: VIEM_CHAINS[key], transport: http(a.chain.rpcUrls[0]) });
      return wallet.sendTransaction({ ...call, gas, maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas, nonce: t.nonce ? Number(BigInt(t.nonce)) : undefined });
    }
    case 'switch_chain':
      return null;
    case 'tron_sign_message':
      return { signature: signTronMessage(a.message, keys.tron) };
    case 'tron_sign_tx': {
      const signed = signTronTxObject(a.tx, keys.tron);
      return signed;
    }
  }
}

/** Fee preview for a dApp tx: gas (given or estimated, +20%) × market/declared EIP-1559 fees. */
export async function previewEvmTxFee(a: Extract<Analysis, { kind: 'send_tx' }>) {
  const key = Object.entries(VIEM_CHAINS).find(([, c]) => c.id === a.chain.chainId)?.[0];
  if (!key || !isEvmChain(key)) throw new Error('Unsupported chain');
  const c = publicClient(key);
  const t = a.tx;
  const call = { to: t.to as `0x${string}`, value: big(t.value) ?? 0n, data: t.data };
  const [gas, block, market] = await Promise.all([
    big(t.gas ?? t.gasLimit) ?? c.estimateGas({ account: t.from as `0x${string}`, ...call }).then(padGas),
    c.getBlock({ blockTag: 'latest' }),
    marketFee(key),
  ]);
  const maxFee = big(t.maxFeePerGas) ?? market.maxFeePerGas;
  const tip = big(t.maxPriorityFeePerGas) ?? market.maxPriorityFeePerGas;
  const base = block.baseFeePerGas ?? 0n;
  const eff = base + tip < maxFee ? base + tip : maxFee;
  return { gas, maxCost: gas * maxFee, expectedCost: gas * eff, dappSetFees: !!t.maxFeePerGas };
}
