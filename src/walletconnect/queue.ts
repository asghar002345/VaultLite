import { useSyncExternalStore } from 'react';

import type { Analysis } from './requests';
import type { SessionRequest } from './walletkit';

export interface PendingRequest {
  request: SessionRequest;
  analysis: Exclude<Analysis, { kind: 'error' }>;
  peer: { name: string; url: string };
}

/** Pure: quick, human-readable requests get a sheet; complex ones get the full request screen. */
export function presentationFor(kind: PendingRequest['analysis']['kind']): 'sheet' | 'screen' {
  return kind === 'personal_sign' || kind === 'tron_sign_message' ? 'sheet' : 'screen';
}

/** Tiny external store for pending WalletConnect requests (FIFO). */
export function createQueue() {
  let items: PendingRequest[] = [];
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    push(p: PendingRequest) {
      if (items.some((x) => x.request.id === p.request.id)) return;
      items = [...items, p];
      emit();
    },
    remove(id: number) {
      const next = items.filter((x) => x.request.id !== id);
      if (next.length !== items.length) { items = next; emit(); }
    },
    get: (id: number) => items.find((x) => x.request.id === id),
    head: () => items[0],
    all: () => items,
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}

export const requestQueue = createQueue();

export function useRequestQueue() {
  return useSyncExternalStore(requestQueue.subscribe, requestQueue.all, requestQueue.all);
}
