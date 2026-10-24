import { router } from 'expo-router';

import { Button, Screen, T, TestnetBanner } from '@/components/ui';

export default function Welcome() {
  return (
    <Screen>
      <TestnetBanner />
      <T variant="hero">VaultLite</T>
      <T>A self-custodial multi-chain wallet demo. Your keys never leave this device.</T>
      <Button testID="create" title="Create new wallet" onPress={() => router.push('/create')} />
      <Button testID="import" variant="secondary" title="Import existing wallet" onPress={() => router.push('/import')} />
    </Screen>
  );
}
