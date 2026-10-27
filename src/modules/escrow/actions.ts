import type { Escrow, Hex } from './types';

export type Role = 'client' | 'provider' | 'arbiter' | 'none';
export type EscrowAction =
  | { kind: 'fund' } | { kind: 'cancel' } | { kind: 'dispute' } | { kind: 'refundExpired' } | { kind: 'providerRefund' }
  | { kind: 'submit'; index: number } | { kind: 'approve'; index: number } | { kind: 'claim'; index: number };

export const roleOf = (e: Escrow, me: Hex): Role => {
  const m = me.toLowerCase();
  if (e.client.toLowerCase() === m) return 'client';
  if (e.provider.toLowerCase() === m) return 'provider';
  if (e.arbiter.toLowerCase() === m) return 'arbiter';
  return 'none';
};

/** UI-side guard mirroring the contract's state machine; the contract remains the authority. */
export function availableActions(e: Escrow, me: Hex, nowSec: number): EscrowAction[] {
  const role = roleOf(e, me);
  const out: EscrowAction[] = [];
  if (e.status === 'Created' && role === 'client') out.push({ kind: 'fund' }, { kind: 'cancel' });
  if (e.status !== 'Funded') return out;
  e.milestones.forEach((m) => {
    if (role === 'provider' && m.status === 'Pending') out.push({ kind: 'submit', index: m.index });
    if (role === 'client' && (m.status === 'Pending' || m.status === 'Submitted')) out.push({ kind: 'approve', index: m.index });
    if (role === 'provider' && m.status === 'Submitted' && nowSec >= m.submittedAt + e.reviewPeriod) out.push({ kind: 'claim', index: m.index });
  });
  if (role === 'client' || role === 'provider') out.push({ kind: 'dispute' });
  if (role === 'provider') out.push({ kind: 'providerRefund' });
  if (role === 'client' && nowSec > e.deadline) out.push({ kind: 'refundExpired' });
  return out;
}
