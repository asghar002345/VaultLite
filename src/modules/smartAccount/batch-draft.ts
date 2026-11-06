import { useSyncExternalStore } from 'react';

import type { Call } from './types';

let draft: Call[] = [];
let sentHash: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setBatchDraft(calls: Call[]) {
  draft = calls;
  sentHash = null;
  emit();
}

/** Record the submitted userOp hash and drop the draft in one update. */
export function markBatchSent(hash: string) {
  sentHash = hash;
  draft = [];
  emit();
}

export function clearBatchSent() {
  sentHash = null;
  emit();
}

export const getBatchDraft = () => draft;
export const getBatchSent = () => sentHash;

/** In-memory batch the review screen confirms. Cleared when the UserOp is submitted. */
export function useBatchDraft(): Call[] {
  return useSyncExternalStore(subscribe, getBatchDraft, getBatchDraft);
}

export function useBatchSent(): string | null {
  return useSyncExternalStore(subscribe, getBatchSent, getBatchSent);
}
