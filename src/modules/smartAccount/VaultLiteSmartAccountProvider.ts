import { toHex, type LocalAccount, type PublicClient } from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';

import type { ChainKey } from '@/config/chains';

import { accountFactoryAbi, ecdsaValidatorAbi, entryPointAbi, sessionKeyValidatorAbi } from './abis';
import { BASE_SEPOLIA_CONTRACTS as C, ENTRY_POINT_V07, isSmartAccountConfigured } from './config';
import {
  accountMessageDigest,
  DEFAULT_SALT,
  encodeExecute,
  encodeFactoryData,
  encodeInitData,
  nonceKeyFor,
  STUB_SIGNATURE,
  wrapErc1271Signature,
} from './encoding';
import type { Call, Hex, SmartAccountChainConfig, SmartAccountProvider, UserOperation } from './types';

export class BundlerNotConfiguredError extends Error {
  readonly code = 'BUNDLER_NOT_CONFIGURED';
  constructor() {
    super('Bundler not configured: set EXPO_PUBLIC_BUNDLER_PROXY_URL to enable sending UserOperations.');
  }
}

export class BundlerRpcError extends Error {
  constructor(readonly rpcCode: number | undefined, message: string) {
    super(message);
  }
}

type Signer = Pick<LocalAccount, 'address' | 'signMessage'> & { sign: NonNullable<LocalAccount['sign']> };

const rpcUserOp = (op: UserOperation) => {
  const h = (v?: bigint) => (v === undefined ? undefined : toHex(v));
  return {
    sender: op.sender,
    nonce: h(op.nonce),
    factory: op.factory,
    factoryData: op.factoryData,
    callData: op.callData,
    callGasLimit: h(op.callGasLimit),
    verificationGasLimit: h(op.verificationGasLimit),
    preVerificationGas: h(op.preVerificationGas),
    maxFeePerGas: h(op.maxFeePerGas),
    maxPriorityFeePerGas: h(op.maxPriorityFeePerGas),
    paymaster: op.paymaster,
    paymasterVerificationGasLimit: h(op.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: h(op.paymasterPostOpGasLimit),
    paymasterData: op.paymasterData,
    signature: op.signature,
  };
};

/** ERC-4337 v0.7 provider for the VaultLite SmartAccount (ECDSA owner validator, factory CREATE2). */
export class VaultLiteSmartAccountProvider implements SmartAccountProvider {
  readonly chain: ChainKey;
  private address?: Hex;
  private readonly initData: Hex;

  constructor(
    private readonly cfg: SmartAccountChainConfig,
    private readonly client: PublicClient,
    private readonly owner: Signer,
    private readonly salt: Hex = DEFAULT_SALT,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!cfg.factory) throw new Error('Smart account factory not configured for this chain');
    this.chain = cfg.chain;
    this.initData = encodeInitData(owner.address);
  }

  get bundlerConfigured(): boolean {
    return isSmartAccountConfigured(this.cfg);
  }

  async getAddress(): Promise<Hex> {
    this.address ??= await this.client.readContract({
      address: this.cfg.factory!,
      abi: accountFactoryAbi,
      functionName: 'getAddress',
      args: [this.initData, this.salt],
    });
    return this.address;
  }

  async isDeployed(): Promise<boolean> {
    const code = await this.client.getCode({ address: await this.getAddress() });
    return !!code && code !== '0x';
  }

  async getNonce(validator: Hex = C.ecdsaOwnerValidator, key = 0): Promise<bigint> {
    return this.client.readContract({
      address: this.cfg.entryPoint,
      abi: entryPointAbi,
      functionName: 'getNonce',
      args: [await this.getAddress(), nonceKeyFor(validator, key)],
    });
  }

  async ownerOnChain(): Promise<Hex> {
    return this.client.readContract({ address: C.ecdsaOwnerValidator, abi: ecdsaValidatorAbi, functionName: 'ownerOf', args: [await this.getAddress()] });
  }

  /** Valid only after SessionKeyValidator is installed on this account. */
  async sessionIdOf(sessionKey: Hex, salt: Hex): Promise<Hex> {
    return this.client.readContract({
      address: C.sessionKeyValidator,
      abi: sessionKeyValidatorAbi,
      functionName: 'sessionIdOf',
      args: [await this.getAddress(), sessionKey, salt],
    });
  }

  userOpHash(op: UserOperation): Hex {
    return getUserOperationHash({
      userOperation: op,
      entryPointAddress: ENTRY_POINT_V07,
      entryPointVersion: '0.7',
      chainId: this.client.chain!.id,
    });
  }

  /** EIP-191 over the raw userOpHash — matches ECDSAOwnerValidator.validateUserOp. */
  async signUserOperation(op: UserOperation): Promise<Hex> {
    return this.owner.signMessage({ message: { raw: this.userOpHash(op) } });
  }

  /** ERC-1271: owner signs the account-bound EIP-712 digest, prefixed with the validator address. */
  async signErc1271(hash: Hex): Promise<Hex> {
    const digest = accountMessageDigest(await this.getAddress(), hash, this.client.chain!.id);
    return wrapErc1271Signature(C.ecdsaOwnerValidator, await this.owner.sign({ hash: digest }));
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const url = this.cfg.bundlerUrl;
    if (!url) throw new BundlerNotConfiguredError();
    const res = await this.fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const j = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
    if (j.error) throw new BundlerRpcError(j.error.code, j.error.message ?? 'Bundler error');
    if (!res.ok) throw new BundlerRpcError(res.status, `Bundler HTTP ${res.status}`);
    return j.result as T;
  }

  private async fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    try {
      const r = await this.rpc<{ fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } }>('pimlico_getUserOperationGasPrice', []);
      return { maxFeePerGas: BigInt(r.fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(r.fast.maxPriorityFeePerGas) };
    } catch (e) {
      if (e instanceof BundlerNotConfiguredError) throw e;
      const f = await this.client.estimateFeesPerGas();
      return { maxFeePerGas: f.maxFeePerGas!, maxPriorityFeePerGas: f.maxPriorityFeePerGas! };
    }
  }

  /** Unsigned op (stub signature) with factory fields when not yet deployed. No gas estimates. */
  async draftUserOperation(calls: Call[]): Promise<UserOperation> {
    const [sender, deployed, nonce] = await Promise.all([this.getAddress(), this.isDeployed(), this.getNonce()]);
    return {
      sender,
      nonce,
      ...(deployed ? {} : { factory: this.cfg.factory!, factoryData: encodeFactoryData(this.initData, this.salt) }),
      callData: encodeExecute(calls),
      callGasLimit: 0n,
      verificationGasLimit: 0n,
      preVerificationGas: 0n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      signature: STUB_SIGNATURE,
    };
  }

  async buildUserOperation(calls: Call[]): Promise<UserOperation> {
    if (!this.cfg.bundlerUrl) throw new BundlerNotConfiguredError();
    const op = { ...(await this.draftUserOperation(calls)), ...(await this.fees()) };
    const g = await this.rpc<Record<string, Hex | undefined>>('eth_estimateUserOperationGas', [rpcUserOp(op), this.cfg.entryPoint]);
    op.callGasLimit = BigInt(g.callGasLimit ?? 0);
    op.verificationGasLimit = BigInt(g.verificationGasLimit ?? 0);
    op.preVerificationGas = BigInt(g.preVerificationGas ?? 0);
    op.signature = await this.signUserOperation(op);
    return op;
  }

  async sendUserOperation(calls: Call[]): Promise<{ userOpHash: Hex }> {
    const op = await this.buildUserOperation(calls);
    const userOpHash = await this.rpc<Hex>('eth_sendUserOperation', [rpcUserOp(op), this.cfg.entryPoint]);
    return { userOpHash };
  }

  async waitForReceipt(userOpHash: Hex, timeoutMs = 120_000): Promise<{ txHash: Hex; success: boolean }> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const r = await this.rpc<{ success: boolean; receipt: { transactionHash: Hex } } | null>('eth_getUserOperationReceipt', [userOpHash]);
      if (r) return { txHash: r.receipt.transactionHash, success: r.success };
      await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error('Timed out waiting for UserOperation receipt');
  }
}
