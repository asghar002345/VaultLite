import { ListRow, Notice, Section } from '@/components/states';
import { Icon } from '@/components/icon';
import { Screen, T } from '@/components/ui';
import { TOKENS } from '@/config/tokens';

export default function Currency() {
  const stables = TOKENS.filter((t) => t.stable);
  return (
    <Screen testID="settings-currency">
      <Section title="Display currency" group>
        <ListRow icon="currency" title="Tether (USDT)" subtitle="Home total is shown in USDT" right={<Icon name="check" color="primary" />} />
      </Section>
      <Notice tone="info">
        Testnet tokens have no market value. The Home total counts test stablecoins in USDT: test USDT 1:1 and test USDC at the live Binance USDC/USDT rate (shown under the total). Native test tokens are never priced. Market prices elsewhere are a labelled Binance mainnet reference.
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
