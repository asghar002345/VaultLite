/** User-facing copy for EntryPoint v0.7 AAxx errors (see smart-account docs/PIMLICO_FLOW.md). */
const AA: Record<string, string> = {
  AA10: 'Account already deployed: the deploy data should not be sent again.',
  AA13: 'Account deployment failed (initCode reverted or ran out of gas).',
  AA14: 'Deployed address does not match the expected smart account address.',
  AA15: 'Deploy data did not create the expected account.',
  AA20: 'Smart account is not deployed and no deploy data was provided.',
  AA21: "The account can't pay the network fee and no sponsor covered it.",
  AA22: 'Operation expired or not yet valid.',
  AA23: 'The account rejected this operation (validation reverted).',
  AA24: 'Signature check failed: the signer is not this account’s owner or session key.',
  AA25: 'Invalid account nonce.',
  AA26: 'Verification gas limit too low.',
  AA30: 'The sponsor (paymaster) contract is not deployed.',
  AA31: 'The sponsor (paymaster) deposit is too low.',
  AA32: 'Sponsorship expired or not yet valid.',
  AA33: 'Sponsor (paymaster) validation reverted.',
  AA34: 'Sponsor signature check failed.',
  AA36: 'Sponsor verification used more gas than its limit.',
  AA40: 'Verification used more gas than the verification gas limit.',
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
  if (!c) return null;
  if (AA[c]) return AA[c];
  if (c.startsWith('AA9')) return `EntryPoint internal/bundler error ${c} (handleOps misuse, not your account).`;
  return `EntryPoint error ${c}.`;
}
