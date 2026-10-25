import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';

import { Button, Card, T } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { useSession } from '@/vault/session';

import { approveProposal, getWalletKit, rejectProposal, rejectRequest, subscribe, unsupportedChains, type Proposal } from './walletkit';

/** Mount while unlocked: inits WalletKit and handles proposals / requests. */
export function WalletConnectHost() {
  const { accounts } = useSession();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReownConfigured()) return;
    getWalletKit().catch((e) => console.warn('[walletkit] init failed', e?.message));
    return subscribe({
      onProposal: setProposal,
      // Day 4–5: route to a signing sheet. For now reject so dApps don't hang.
      onRequest: (r) => void rejectRequest(r, 'VaultLite: signing UI not available yet').catch(() => {}),
    });
  }, []);

  if (!proposal || !accounts) return null;
  const meta = proposal.params.proposer.metadata;
  const bad = unsupportedChains(proposal.params, CHAIN_LIST.map((c) => c.caip2));
  const close = () => {
    setProposal(null);
    setError(null);
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={() => rejectProposal(proposal).finally(close)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: '#0008' }}>
        <Card>
          <T variant="title">Connect to {meta.name}?</T>
          <T variant="caption">{meta.url}</T>
          {proposal.verifyContext?.verified?.validation === 'INVALID' && <T variant="error">Domain verification failed</T>}
          {bad.length > 0 && <T variant="error">Requests unsupported (non-testnet?) chains: {bad.join(', ')}</T>}
          {error && <T variant="error">{error}</T>}
          <Button
            title="Approve"
            disabled={bad.length > 0}
            onPress={() =>
              approveProposal(proposal, accounts.evm.address, accounts.tron.address)
                .then(close)
                .catch((e) => setError(e.message))
            }
          />
          <Button variant="secondary" title="Reject" onPress={() => rejectProposal(proposal).finally(close)} />
        </Card>
      </View>
    </Modal>
  );
}
