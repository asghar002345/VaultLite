import type { ChainKey } from '@/config/chains';

export type Hex = `0x${string}`;

/** ERC-4337 v0.7 PackedUserOperation fields (unpacked form, as used by bundler RPCs). */
export interface UserOperation {
  sender: Hex;
  nonce: bigint;
  factory?: Hex;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Hex;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: Hex;
  signature: Hex;
}

export interface Call {
  to: Hex;
  value?: bigint;
  data?: Hex;
}

export interface SmartAccountChainConfig {
  chain: ChainKey;
  entryPoint: Hex; // e.g. v0.7 0x0000000071727De22E5E9d8BAf0edAc6f37da032
  /** null until deployed. */
  factory: Hex | null;
  factoryAbi?: readonly unknown[];
  accountAbi?: readonly unknown[];
  bundlerUrl: string | null;
  paymasterUrl?: string | null;
}

export interface SmartAccountProvider {
  readonly chain: ChainKey;
  /** Counterfactual address (valid before deployment). */
  getAddress(): Promise<Hex>;
  isDeployed(): Promise<boolean>;
  buildUserOperation(calls: Call[]): Promise<UserOperation>;
  sendUserOperation(calls: Call[]): Promise<{ userOpHash: Hex }>;
  waitForReceipt(userOpHash: Hex, timeoutMs?: number): Promise<{ txHash: Hex; success: boolean }>;
}
