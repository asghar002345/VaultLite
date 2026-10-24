import { Button, Card, Screen, T, TestnetBanner } from '@/components/ui';
import { CHAIN_LIST } from '@/config/chains';
import { isReownConfigured } from '@/config/env';
import { useSession } from '@/vault/session';

export default function Home() {
  const { accounts, lock } = useSession();
  if (!accounts) return null;
  return (
    <Screen>
      <TestnetBanner />
      <T variant="title">Accounts</T>
      <Card>
        <T>EVM ({CHAIN_LIST.filter((c) => c.family === 'evm').map((c) => c.name).join(', ')})</T>
        <T variant="mono" selectable testID="evm-address">{accounts.evm.address}</T>
        {accounts.evm.path && <T variant="caption">{accounts.evm.path}</T>}
      </Card>
      <Card>
        <T>Tron (Nile testnet)</T>
        <T variant="mono" selectable testID="tron-address">{accounts.tron.address}</T>
        {accounts.tron.path && <T variant="caption">{accounts.tron.path}</T>}
      </Card>
      <Card>
        <T>Solana</T>
        <T variant="caption">{accounts.solana.note}</T>
      </Card>
      {!isReownConfigured() && (
        <T variant="caption">WalletConnect disabled: set EXPO_PUBLIC_REOWN_PROJECT_ID (see .env.example).</T>
      )}
      <Button variant="secondary" title="Lock now" onPress={lock} />
    </Screen>
  );
}
