/** Pure: classify an EVM recipient from its on-chain bytecode. `code` is undefined/'0x' for EOAs. */
export type RecipientRisk = 'token-contract' | 'contract' | null;

export function recipientRisk(to: string, tokenAddress: string | null, code: string | undefined | null): RecipientRisk {
  if (tokenAddress && to.toLowerCase() === tokenAddress.toLowerCase()) return 'token-contract';
  if (code && code !== '0x') return 'contract';
  return null;
}
