import { ListRow, Notice, Section } from '@/components/states';
import { Icon } from '@/components/icon';
import { Screen, T } from '@/components/ui';
import { TOKENS } from '@/config/tokens';

export default function Currency() {
  const stables = TOKENS.filter((t) => t.stable);
  return (
    <Screen testID="settings-currency">
      <Section title="Display currency" group>
        <ListRow icon="currency" title="US Dollar (USD)" subtitle="Used for the Home total" right={<Icon name="check" color="primary" />} />
      </Section>
      <Notice tone="info">
        Testnet tokens have no market price, so there is no price feed to convert into other currencies. VaultLite values test stablecoins at $1 and leaves native test tokens unpriced.
      </Notice>
      <Section title={`Valued at $1 (${stables.length})`}>
        {stables.map((t) => (
          <T key={`${t.chain}:${t.address}`} variant="caption">
            {t.symbol} · {t.name} · {t.chain}
          </T>
        ))}
      </Section>
    </Screen>
  );
}
