import { Redirect } from 'expo-router';

import { useSession } from '@/vault/session';

export default function Index() {
  const { status } = useSession();
  if (status === 'unlocked') return <Redirect href="/home" />;
  if (status === 'locked') return <Redirect href="/lock" />;
  return <Redirect href="/welcome" />;
}
