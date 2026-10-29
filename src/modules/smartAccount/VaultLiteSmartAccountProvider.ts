import { type LocalAccount, type PublicClient } from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';

import type { ChainKey } from '@/config/chains';

import { accountFactoryAbi, ecdsaValidatorAbi, entryPointAbi, sessionKeyValidatorAbi } from './abis';
import { BundlerClient, BundlerNotConfiguredError, BundlerRpcError, definedOnly, type PaymasterFields, type UserOpReceipt } from './client';
import { BASE_SEPOLIA_CONTRACTS as C, ENTRY_POINT_V07 } from './config';
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

export { BundlerNotConfiguredError, BundlerRpcError } from './client';

/**
 * The bundler accepted an op under a different hash than we signed. Detection only: the op is already
 * submitted, so callers must surface this as a hard error and NOT poll a receipt for the bundler's hash.
 */
export class UserOpHashMismatchError extends Error {
  constructor(readonly expected: Hex, readonly returned: Hex) {
    super(`Bundler returned userOpHash ${returned}, expected ${expected}. The op may have been altered; do not trust its status.`);
  }
}

type Signer = Pick<LocalAccount, 'address' | 'signMessage'> & { sign: NonNullable<LocalAccount['sign']> };

/** Which validator signs the op. Default: ECDSA owner. Session keys pass their own (see sessions.ts). */
export interface OpSigner {
  validator: Hex;
  /** Lane in the 4-byte nonce key (default 0). */
  nonceLane?: number;
  stubSignature: Hex;
  signUserOpHash: (userOpHash: Hex) => Promise<Hex>;
  /**
   * Added to the estimated verificationGasLimit. Session validation fails early on the stub signature
   * (before its SSTOREs), so estimation under-counts; see sessionVerificationGasBuffer().
   */
  verificationGasBuffer?: bigint;
  /** Validator must already be installed (session keys): reject undeployed accounts up front. */
  requiresDeployed?: boolean;
}

export interface BuildOptions {
  /** Per-op override of the provider default. Session/module management is never sponsored: pass false. */
  sponsor?: false | { context?: Record<string, unknown> };
  /** When the proxy answers not_sponsorable: 'throw' (default; UI asks the user) or 'self-pay' (retry unsponsored). */
  onNotSponsorable?: 'throw' | 'self-pay';
}

export interface ProviderOptions {
  salt?: Hex;
  bundler?: BundlerClient;
  /** ERC-7677 sponsorship via the proxy's paymaster. `false` = account pays its own gas. Default: sponsored, empty context. */
  sponsor?: false | { context?: Record<string, unknown> };
}

/** ERC-4337 v0.7 provider for the VaultLite SmartAccount (ECDSA owner validator, factory CREATE2). */
export class VaultLiteSmartAccountProvider implements SmartAccountProvider {
  readonly chain: ChainKey;
  readonly bundler: BundlerClient;
  /** Cached per instance: one provider = one (owner, salt) pair. Create a new provider for another salt. */
  private address?: Hex;
  private readonly initData: Hex;
  private readonly salt: Hex;
  private readonly sponsor: ProviderOptions['sponsor'];

  constructor(
    private readonly cfg: SmartAccountChainConfig,
    private readonly client: PublicClient,
    private readonly owner: Signer,
    opts: ProviderOptions = {},
  ) {
    if (!cfg.factory) throw new Error('Smart account factory not configured for this chain');
    this.chain = cfg.chain;
    this.salt = opts.salt ?? DEFAULT_SALT;
    this.sponsor = opts.sponsor ?? {};
    this.initData = encodeInitData(owner.address);
    this.bundler = opts.bundler ?? new BundlerClient(cfg.bundlerUrl, this.chainId, cfg.entryPoint);
  }

  private get chainId(): number {
    return this.client.chain!.id;
  }

  get bundlerConfigured(): boolean {
    return this.bundler.configured && !!this.cfg.factory;
  }

  /** Default signer: owner EOA, EIP-191 over the raw 32-byte userOpHash (ECDSAOwnerValidator). */
  get ownerSigner(): OpSigner {
    return {
      validator: C.ecdsaOwnerValidator,
      stubSignature: STUB_SIGNATURE,
      signUserOpHash: (h) => this.owner.signMessage({ message: { raw: h } }),
    };
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
    return getUserOperationHash({ userOperation: op, entryPointAddress: ENTRY_POINT_V07, entryPointVersion: '0.7', chainId: this.chainId });
  }

  /** EIP-191 over the raw userOpHash — matches ECDSAOwnerValidator.validateUserOp. */
  async signUserOperation(op: UserOperation): Promise<Hex> {
    return this.ownerSigner.signUserOpHash(this.userOpHash(op));
  }

  /** ERC-1271: owner signs the account-bound EIP-712 digest, prefixed with the validator address. */
  async signErc1271(hash: Hex): Promise<Hex> {
    const digest = accountMessageDigest(await this.getAddress(), hash, this.chainId);
    return wrapErc1271Signature(C.ecdsaOwnerValidator, await this.owner.sign({ hash: digest }));
  }

  /** Unsigned op with stub signature, zero gas; factory fields only while undeployed. Chain reads only. */
  async draftUserOperation(calls: Call[], signer: OpSigner = this.ownerSigner): Promise<UserOperation> {
    const [sender, deployed, nonce] = await Promise.all([this.getAddress(), this.isDeployed(), this.getNonce(signer.validator, signer.nonceLane ?? 0)]);
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
      signature: signer.stubSignature,
    };
  }

  /**
   * Full PIMLICO_FLOW sequence: supported EP check → gas price → (pm stub) → estimate (+ signer buffer) →
   * (pm data) → userOpHash → sign. Paymaster data is final before signing (paymasterAndData is hashed).
   */
  async buildUserOperation(calls: Call[], signer: OpSigner = this.ownerSigner, opts: BuildOptions = {}): Promise<UserOperation> {
    if (!this.bundler.configured) throw new BundlerNotConfiguredError();
    if (signer.requiresDeployed && !(await this.isDeployed())) {
      throw new Error('This signer needs a deployed account with its validator installed (deploy with an owner op first).');
    }
    // Calls to the account itself (module mgmt) or the SessionKeyValidator are never sponsored (review S1/S4).
    const self = (await this.getAddress()).toLowerCase();
    const forceSelfPay = calls.some((c) => [self, C.sessionKeyValidator.toLowerCase()].includes(c.to.toLowerCase()));
    const sponsor = forceSelfPay ? false : opts.sponsor === undefined ? this.sponsor : opts.sponsor;
    try {
      return await this.build(calls, signer, sponsor);
    } catch (e) {
      if (sponsor && opts.onNotSponsorable === 'self-pay' && e instanceof BundlerRpcError && e.notSponsorable) return this.build(calls, signer, false);
      throw e;
    }
  }

  private async build(calls: Call[], signer: OpSigner, sponsor: ProviderOptions['sponsor']): Promise<UserOperation> {
    await this.bundler.assertEntryPointSupported();
    let op: UserOperation = { ...(await this.draftUserOperation(calls, signer)), ...(await this.bundler.gasPrice()) };
    let stub: PaymasterFields | null = null;
    if (sponsor) {
      stub = await this.bundler.paymasterStubData(op, sponsor.context);
      op = { ...op, ...stripFinal(stub) };
    }
    const final = !!stub?.isFinal;
    const g = await this.bundler.estimateGas(op);
    op = {
      ...op,
      callGasLimit: g.callGasLimit,
      verificationGasLimit: g.verificationGasLimit + (signer.verificationGasBuffer ?? 0n),
      preVerificationGas: g.preVerificationGas,
    };
    // A final stub's paymasterData is already signed over its own gas limits: keep them (else AA34).
    if (sponsor && !final) {
      op = { ...op, ...definedOnly({ paymasterVerificationGasLimit: g.paymasterVerificationGasLimit, paymasterPostOpGasLimit: g.paymasterPostOpGasLimit }) };
      // pm_getPaymasterData usually returns only paymaster/paymasterData: merge defined keys only.
      op = { ...op, ...stripFinal(await this.bundler.paymasterData(op, sponsor.context)) };
    }
    if (sponsor && (op.paymasterVerificationGasLimit === undefined || op.paymasterPostOpGasLimit === undefined)) {
      throw new Error('Sponsored op is missing paymaster gas limits (stub, estimate and paymaster data all omitted them).');
    }
    return { ...op, signature: await signer.signUserOpHash(this.userOpHash(op)) };
  }

  async sendUserOperation(calls: Call[], signer?: OpSigner, opts?: BuildOptions): Promise<{ userOpHash: Hex }> {
    const op = await this.buildUserOperation(calls, signer, opts);
    const expected = this.userOpHash(op); // computed BEFORE submission
    const returned = await this.bundler.sendUserOperation(op);
    if (returned.toLowerCase() !== expected.toLowerCase()) throw new UserOpHashMismatchError(expected, returned);
    return { userOpHash: expected };
  }

  async waitForReceipt(userOpHash: Hex, timeoutMs = 120_000): Promise<{ txHash: Hex; success: boolean } & UserOpReceipt> {
    return this.bundler.waitForReceipt(userOpHash, { timeoutMs });
  }
}

function stripFinal<T extends { isFinal?: boolean }>(p: T): Omit<T, 'isFinal'> {
  const { isFinal: _f, ...rest } = p;
  return rest;
}
