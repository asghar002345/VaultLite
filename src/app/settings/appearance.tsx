import { Icon } from '@/components/icon';
import { ListRow, Notice, Section } from '@/components/states';
import { Screen } from '@/components/ui';

export default function Appearance() {
  return (
    <Screen testID="settings-appearance">
      <Section title="Theme" group>
        <ListRow icon="moon" title="Vault Dark" subtitle="The only theme in this version" right={<Icon name="check" color="primary" />} />
      </Section>
      <Notice>VaultLite uses a single dark theme tuned for legibility and low glare. A light theme may return once it has been designed and reviewed.</Notice>
    </Screen>
  );
}
