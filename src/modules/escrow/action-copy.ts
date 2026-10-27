import type { EscrowAction } from './actions';
import type { Escrow } from './types';

/** Pure: stable string key for an action, used in routes and test ids (e.g. "approve-0"). */
export const actionKey = (a: EscrowAction) => ('index' in a ? `${a.kind}-${a.index}` : a.kind);

/** Pure: inverse of actionKey; null for anything malformed. */
export function parseActionKey(key: string | undefined): EscrowAction | null {
  if (!key) return null;
  const m = /^(fund|cancel|dispute|refundExpired|providerRefund)$|^(submit|approve|claim)-(\d{1,2})$/.exec(key);
  if (!m) return null;
  if (m[1]) return { kind: m[1] as 'fund' };
  return { kind: m[2] as 'submit', index: Number(m[3]) };
}

export interface ActionCopy {
  title: string;
  verb: string;
  body: string;
  /** Funds that move (6-dp USDC base units), if any. */
  amount?: bigint;
  danger: boolean;
  /** Plain-language steps the contract performs. */
  effects: string[];
}

const unsettled = (e: Escrow) => e.total - e.settled;

/** Pure: human copy for the action's summary step. */
export function describeAction(a: EscrowAction, e: Escrow): ActionCopy {
  const ms = 'index' in a ? e.milestones[a.index] : undefined;
  const n = 'index' in a ? a.index + 1 : 0;
  switch (a.kind) {
    case 'fund':
      return { title: 'Fund escrow', verb: 'Fund', danger: false, amount: e.total, body: 'Approve USDC and deposit the full escrow amount into the contract.', effects: ['Approves the contract to spend your test USDC', 'Transfers the total into escrow', 'Status becomes Funded'] };
    case 'cancel':
      return { title: 'Cancel escrow', verb: 'Cancel escrow', danger: true, body: 'Cancel this unfunded escrow. No funds have moved yet.', effects: ['Status becomes Cancelled', 'This cannot be undone'] };
    case 'dispute':
      return { title: 'Raise dispute', verb: 'Raise dispute', danger: true, amount: unsettled(e), body: 'Freeze the remaining funds and ask the arbiter to decide.', effects: ['Status becomes Disputed', 'Approvals, claims and submissions stop', 'Only the arbiter can resolve it'] };
    case 'refundExpired':
      return { title: 'Refund after deadline', verb: 'Refund', danger: false, amount: unsettled(e), body: 'The deadline has passed; reclaim every unreleased milestone.', effects: ['Unreleased milestones are refunded to you', 'Funds become withdrawable from Escrow → Withdraw'] };
    case 'providerRefund':
      return { title: 'Refund the client', verb: 'Refund client', danger: true, amount: unsettled(e), body: 'Voluntarily return all unreleased funds to the client.', effects: ['Unreleased milestones are refunded to the client', 'Status becomes Refunded'] };
    case 'submit':
      return { title: `Submit milestone ${n}`, verb: 'Submit', danger: false, amount: ms?.amount, body: 'Mark this milestone as delivered. The client can approve it, or you can claim it after the review period.', effects: ['Milestone becomes Submitted', 'Review period starts now'] };
    case 'approve':
      return { title: `Approve milestone ${n}`, verb: 'Approve & release', danger: false, amount: ms?.amount, body: 'Release this milestone’s payment to the provider.', effects: ['Milestone becomes Released', 'Provider can withdraw the amount (minus fee)'] };
    case 'claim':
      return { title: `Claim milestone ${n}`, verb: 'Claim', danger: false, amount: ms?.amount, body: 'The review period ended without a decision; release this milestone to yourself.', effects: ['Milestone becomes Released', 'Amount (minus fee) becomes withdrawable'] };
  }
}
