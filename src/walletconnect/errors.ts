/**
 * JSON-RPC error codes returned to dApps.
 * EIP-1193: 4001 user rejected, 4100 unauthorized, 4200 unsupported method, 4901 chain disconnected.
 * EIP-3326: 4902 unrecognized chain (wallet_switchEthereumChain). JSON-RPC: -32602 invalid params.
 */
export const RPC_ERRORS = {
  userRejected: { code: 4001, message: 'User rejected the request.' },
  unauthorized: { code: 4100, message: 'The requested account and/or method has not been authorized.' },
  unsupportedMethod: { code: 4200, message: 'The wallet does not support this method.' },
  chainNotApproved: { code: 4901, message: 'Chain not approved in this session.' },
  unrecognizedChain: { code: 4902, message: 'Unrecognized chain (VaultLite is testnet-only).' },
  invalidParams: { code: -32602, message: 'Invalid params.' },
  internal: { code: -32603, message: 'Internal error.' },
} as const;

export type RpcError = { code: number; message: string };
export const rpcError = (base: RpcError, detail?: string): RpcError => ({ code: base.code, message: detail ? `${base.message} ${detail}` : base.message });
