import { ConnectedAppsView } from '@/walletconnect/connected-apps';

export default function WalletConnectSessions() {
  return <ConnectedAppsView tab showPair testID="wc-sessions" />;
}
