/** User-facing copy for EntryPoint v0.7 AAxx errors (see smart-account docs/PIMLICO_FLOW.md). */
const AA: Record<string, string> = {
  AA10: 'Account already deployed: the deploy data should not be sent again.',
  AA13: 'Account deployment failed (factory reverted or ran out of gas).',
  AA14: 'Deployed address does not match the expected smart account address.',
  AA20: 'Smart account is not deployed and no deploy data was provided.',
  AA21: "The account can't pay the network fee and no sponsor covered it.",
  AA22: 'Operation expired or not yet valid.',
  AA23: 'The account rejected this operation (validation reverted).',
  AA24: 'Signature check failed: the signer is not this account’s owner or session key.',
  AA25: 'Invalid nonce: another operation was sent first. Try again.',
  AA26: 'Verification gas limit too low.',
  AA31: 'The sponsor (paymaster) deposit is too low.',
  AA32: 'Sponsorship expired or not yet valid.',
  AA33: 'The sponsor rejected this operation (policy or quota).',
  AA34: 'Sponsor signature check failed.',
  AA40: 'Verification used more gas than allowed.',
  AA41: 'Too little verification gas.',
  AA50: 'Sponsor post-operation step reverted.',
  AA51: 'Prefund below actual gas cost.',
};

export function aaCode(message: string): string | null {
  const m = /\bAA[1-9][0-9]\b/.exec(message);
  return m ? m[0] : null;
}

export function describeAAError(message: string): string | null {
  const c = aaCode(message);
  return c ? (AA[c] ?? `EntryPoint error ${c}.`) : null;
}
