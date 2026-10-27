import { useQueries } from '@tanstack/react-query';
import { Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Notice, Section } from '@/components/states';
import { Button, Card, Screen, T } from '@/components/ui';
import { TokenOrb } from '@/components/wallet';
import { CHAIN_LIST, type ChainKey } from '@/config/chains';
import { useTheme } from '@/hooks/use-theme';
import { chainHealth } from '@/services/health';
import { updateSettings, useSettings } from '@/store/settings';

export default function Networks() {
  const t = useTheme();
  const { hiddenChains } = useSettings();
  const keys = CHAIN_LIST.map((c) => c.key as ChainKey);
  const health = useQueries({ queries: keys.map((k) => ({ queryKey: ['health', k], queryFn: () => chainHealth(k), staleTime: 30_000 })) });
  const toggle = (k: string, show: boolean) => updateSettings({ hiddenChains: show ? hiddenChains.filter((x) => x !== k) : [...hiddenChains, k] });
  const visible = keys.length - hiddenChains.length;
  return (
    <Screen testID="settings-networks">
      <Notice>Live RPC status for each testnet. Hiding a network only removes it from the Home list; balances and history still work.</Notice>
      <Section title="Testnets">
        {CHAIN_LIST.map((c, i) => {
          const h = health[i];
          const shown = !hiddenChains.includes(c.key);
          const status = h.isPending ? 'Checking…' : h.data?.ok ? `Block ${h.data.height?.toString()} · ${h.data.latencyMs} ms` : `Unreachable${h.data?.error ? `: ${h.data.error.slice(0, 60)}` : ''}`;
          return (
            <Card key={c.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TokenOrb chain={c.key} symbol={c.nativeCurrency.symbol} size={36} />
                <View style={{ flex: 1 }}>
                  <T variant="label">{c.name}</T>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Icon name={h.isPending ? 'pending' : h.data?.ok ? 'success' : 'danger'} size="sm" tint={h.isPending ? t.textSecondary : h.data?.ok ? t.success : t.danger} />
                    <T variant="caption" style={{ flex: 1 }}>{status}</T>
                  </View>
                </View>
                <Switch
                  testID={`show-${c.key}`}
                  accessibilityLabel={`Show ${c.name} on Home`}
                  value={shown}
                  disabled={shown && visible <= 1}
                  onValueChange={(v) => toggle(c.key, v)}
                />
              </View>
            </Card>
          );
        })}
      </Section>
      <Button variant="secondary" icon="refresh" title="Re-check all" onPress={() => health.forEach((h) => h.refetch())} />
    </Screen>
  );
}
