import { Button, Screen, T } from '@/components/ui';
import { TxRow } from '@/components/tx-row';
import { clearHistory, useHistory } from '@/store/history';
import { useSession } from '@/vault/session';

export default function Activity() {
  const { accounts } = useSession();
  const h = useHistory(accounts ? { evm: accounts.evm.address, tron: accounts.tron.address } : undefined);
  return (
    <Screen>
      <T variant="caption">Sends made from this device (stored locally, not fetched from explorers).</T>
      {h.list.length === 0 && <T variant="caption">No activity yet.</T>}
      {h.list.map((tx) => <TxRow key={tx.hash} tx={tx} />)}
      {h.list.length > 0 && <Button variant="secondary" title="Clear local history" onPress={() => clearHistory().then(() => h.refetch())} />}
    </Screen>
  );
}
