/** Map viem / RPC / TronGrid errors to short, actionable messages. Never leaks URLs. */
const RULES: [RegExp, string][] = [
  [/insufficient funds|exceeds the balance|InsufficientFundsError/i, 'Not enough native token to pay amount + network fee.'],
  [/nonce too low|NonceTooLowError|already known/i, 'This transaction (nonce) was already used — it may have been mined or replaced.'],
  [/replacement transaction underpriced|ReplacementUnderpriced|underpriced/i, 'Replacement fee too low. Bump the fee by at least 10% over the pending transaction.'],
  [/max fee per gas less than block base fee|FeeCapTooLow/i, 'Fee is below the current base fee. Refresh fees and try again.'],
  [/intrinsic gas too low|gas required exceeds|out of gas/i, 'Gas limit too low for this transaction.'],
  [/execution reverted|ContractFunctionRevertedError|reverted/i, 'The contract rejected this transaction (reverted). Check the token balance and recipient.'],
  [/user rejected|UserRejected/i, 'Request was rejected.'],
  [/timed? ?out|TimeoutError|AbortError/i, 'The network took too long to respond. Check your connection and retry.'],
  [/HTTP request failed|fetch failed|Network request failed|ECONN|ENOTFOUND|HTTP 5\d\d/i, 'Could not reach the testnet RPC. It may be down — retry in a moment.'],
  [/HTTP 429|rate limit|too many requests/i, 'The public RPC is rate-limiting requests. Wait a few seconds and retry.'],
  // TronGrid broadcast codes
  [/BANDWITH_ERROR|BANDWIDTH_ERROR|Account resource insufficient/i, 'Not enough TRX for bandwidth. Get TRX from the Nile faucet.'],
  [/balance is not sufficient|CONTRACT_VALIDATE_ERROR.*balance/i, 'Not enough TRX for this transfer.'],
  [/TAPOS_ERROR|TRANSACTION_EXPIRATION_ERROR|expired/i, 'The Tron transaction expired before broadcast. Try again.'],
  [/DUP_TRANSACTION_ERROR/i, 'This Tron transaction was already broadcast.'],
  [/SIGERROR|validate signature error/i, 'Tron signature was rejected.'],
  [/account .* does not exist|account not found/i, 'The sending Tron account is not activated yet — receive some TRX first.'],
  [/Wallet is locked/i, 'Wallet is locked. Unlock and try again.'],
];

export function humanizeError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; details?: string; name?: string } | undefined;
  const text = [err?.name, err?.shortMessage, err?.details, err?.message, typeof e === 'string' ? e : ''].filter(Boolean).join(' | ');
  for (const [re, msg] of RULES) if (re.test(text)) return msg;
  const first = (err?.shortMessage ?? err?.message ?? String(e ?? 'Unknown error')).split('\n')[0];
  return first.replace(/https?:\/\/\S+/g, '[rpc]').slice(0, 160);
}
