import { Icon } from '@/components/icon';
import { ListRow, Notice, Section } from '@/components/states';
import { Screen } from '@/components/ui';
import { updateSettings, useSettings, type ThemePref } from '@/store/settings';

const OPTIONS: { key: ThemePref; label: string; icon: 'system' | 'moon' | 'sun'; sub: string }[] = [
  { key: 'system', label: 'System', icon: 'system', sub: 'Follow the device (dark unless it reports light)' },
  { key: 'dark', label: 'Dark', icon: 'moon', sub: 'Always dark' },
  { key: 'light', label: 'Light', icon: 'sun', sub: 'Always light' },
];

export default function Appearance() {
  const { theme } = useSettings();
  return (
    <Screen testID="settings-appearance">
      <Section title="Theme">
        {OPTIONS.map((o) => (
          <ListRow
            key={o.key}
            testID={`theme-${o.key}`}
            icon={o.icon}
            title={o.label}
            subtitle={o.sub}
            onPress={() => updateSettings({ theme: o.key })}
            right={theme === o.key ? <Icon name="check" color="primary" /> : <></>}
          />
        ))}
      </Section>
      <Notice>Colours and typography are centralised theme tokens; the final visual direction will be applied in a later pass.</Notice>
    </Screen>
  );
}
