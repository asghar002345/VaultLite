import { useQuery } from '@tanstack/react-query';

import { ErrorState, ListRow, Notice, Section } from '@/components/states';
import { Screen, T } from '@/components/ui';
import { BASE_SEPOLIA_CONTRACTS, readSmartAccountStatus, SMART_ACCOUNT_CONFIG, isSmartAccountConfigured } from '@/modules/smartAccount';
import { publicClient } from '@/services/evm';
import { useSession } from '@/vault/session';

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export default function SmartAccountScreen() {
  const { accounts } = useSession();
  const owner = accounts?.evm.address as `0x${string}` | undefined;
  const cfg = SMART_ACCOUNT_CONFIG.baseSepolia;
  const bundlerReady = isSmartAccountConfigured(cfg);
  const q = useQuery({
    queryKey: ['smart-account', owner],
    enabled: !!owner,
    queryFn: () => readSmartAccountStatus(publicClient('baseSepolia'), owner!),
  });
  return (
    <Screen testID="settings-smart-account">
      <T variant="title">Smart account</T>
      <T variant="caption">ERC-4337 (EntryPoint v0.7) on Base Sepolia, owned by your wallet key.</T>
      {!bundlerReady ? (
        <Notice testID="bundler-not-configured" tone="disabled">
          Bundler not configured. Sending UserOperations is disabled until EXPO_PUBLIC_BUNDLER_PROXY_URL is set. Your address below is still valid and can receive testnet funds.
        </Notice>
      ) : null}
      {q.error ? <ErrorState title="Couldn't read the factory" error={q.error} onRetry={() => void q.refetch()} /> : null}
      <Section title="Account" group>
        <ListRow icon="wallet" title="Address" value={q.data ? short(q.data.address) : q.isLoading ? 'Reading…' : '—'} />
        <ListRow icon="info" title="Status" value={q.data ? (q.data.deployed ? 'Deployed' : 'Counterfactual (deploys on first op)') : '—'} />
        <ListRow icon="key" title="Owner" value={owner ? short(owner) : '—'} />
      </Section>
      <Section title="Contracts" group>
        <ListRow icon="network" title="Factory" value={short(BASE_SEPOLIA_CONTRACTS.accountFactory)} />
        <ListRow icon="shield" title="Owner validator" value={short(BASE_SEPOLIA_CONTRACTS.ecdsaOwnerValidator)} />
      </Section>
    </Screen>
  );
}
