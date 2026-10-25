import { Core } from '@walletconnect/core';
import { WalletKit, type IWalletKit, type WalletKitTypes } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';

import { env, isReownConfigured } from '@/config/env';

import { supportedNamespaces } from './namespaces';

export type Proposal = WalletKitTypes.SessionProposal;
export type SessionRequest = WalletKitTypes.SessionRequest;

type Listener = {
  onProposal?: (p: Proposal) => void;
  onRequest?: (r: SessionRequest) => void;
  onSessionsChanged?: () => void;
};

let kit: IWalletKit | null = null;
let initPromise: Promise<IWalletKit> | null = null;
const listeners = new Set<Listener>();
const emit = <K extends keyof Listener>(k: K, ...a: Parameters<NonNullable<Listener[K]>>) =>
  listeners.forEach((l) => (l[k] as ((...x: unknown[]) => void) | undefined)?.(...a));

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function getWalletKit() {
  if (!isReownConfigured()) return Promise.reject(new Error('EXPO_PUBLIC_REOWN_PROJECT_ID not set'));
  if (kit) return Promise.resolve(kit);
  initPromise ??= (async () => {
    const core = new Core({ projectId: env.REOWN_PROJECT_ID });
    const k = await WalletKit.init({
      core,
      metadata: {
        name: 'VaultLite (testnet)',
        description: 'Testnet-only demo wallet',
        url: 'https://vaultlite.invalid',
        icons: [],
        redirect: { native: 'vaultlite://' },
      },
    });
    k.on('session_proposal', (p) => emit('onProposal', p));
    // Signing UI lands Day 4–5; until then requests are surfaced to listeners, and
    // rejected if nobody handles them (see rejectRequest).
    k.on('session_request', (r) => emit('onRequest', r));
    k.on('session_delete', () => emit('onSessionsChanged'));
    kit = k;
    return k;
  })().catch((e) => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

export async function pair(uri: string) {
  if (!uri.startsWith('wc:')) throw new Error('Not a WalletConnect URI');
  await (await getWalletKit()).pair({ uri });
}

export async function approveProposal(p: Proposal, evmAddress: string, tronAddress: string) {
  const k = await getWalletKit();
  const namespaces = buildApprovedNamespaces({
    proposal: p.params,
    supportedNamespaces: supportedNamespaces(evmAddress, tronAddress),
  });
  const s = await k.approveSession({ id: p.id, namespaces });
  emit('onSessionsChanged');
  return s;
}

export async function rejectProposal(p: Proposal) {
  await (await getWalletKit()).rejectSession({ id: p.id, reason: getSdkError('USER_REJECTED') });
}

export async function respondError(r: SessionRequest, error: { code: number; message: string }) {
  await (await getWalletKit()).respondSessionRequest({ topic: r.topic, response: { id: r.id, jsonrpc: '2.0', error } });
}

export async function respondResult(r: SessionRequest, result: unknown) {
  await (await getWalletKit()).respondSessionRequest({ topic: r.topic, response: { id: r.id, jsonrpc: '2.0', result } });
}

/** Tell the dApp the active EVM chain changed (after wallet_switchEthereumChain). */
export async function emitChainChanged(topic: string, caip2: string, chainId: number) {
  await (await getWalletKit()).emitSessionEvent({ topic, event: { name: 'chainChanged', data: chainId }, chainId: caip2 });
}

/** Chains approved in this session for the namespace of `caip2`. */
export function sessionChains(topic: string, caip2: string): string[] {
  const s = kit?.getActiveSessions()[topic];
  const ns = s?.namespaces[caip2.split(':')[0]];
  if (!ns) return [];
  return ns.chains ?? ns.accounts.map((a) => a.split(':').slice(0, 2).join(':'));
}

export async function listSessions() {
  if (!kit) return [];
  return Object.values(kit.getActiveSessions());
}

export async function disconnect(topic: string) {
  await (await getWalletKit()).disconnectSession({ topic, reason: getSdkError('USER_DISCONNECTED') });
  emit('onSessionsChanged');
}

/** Pure helper for tests/UI: does the proposal ask only for chains we support? */
export function unsupportedChains(p: Proposal['params'], supported: string[]): string[] {
  const asked = [
    ...Object.values(p.requiredNamespaces ?? {}).flatMap((n) => n.chains ?? []),
  ];
  return asked.filter((c) => !supported.includes(c));
}
