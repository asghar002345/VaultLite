// Phone-viewport screenshots of the market screens (web export). TESTNET ONLY: public test mnemonic, never signs.
// Usage: npm run export:web && npx expo serve --port 8099 &  then  node scripts/market-shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8099';
const OUT = path.resolve(process.env.OUT ?? 'market-shots');
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '135790';
const id = (t) => `[data-testid="${t}"]`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
const shot = async (name, full = true) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full, animations: 'disabled' });
  console.log('shot', name);
};
const go = (r) => page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, r);

await page.goto(`${BASE}/`);
await page.locator(id('import')).click({ timeout: 30_000 });
await page.locator(id('import-secret')).fill(MNEMONIC);
await page.locator(id('import-continue')).click();
await page.locator(id('pin')).fill(PIN);
await page.locator(id('pin-confirm')).fill(PIN);
await page.locator(id('create-vault')).click();
await page.locator(id('home')).waitFor({ timeout: 60_000 });
await page.locator(`${id('home-markets')} >> text=/\\d/`).first().waitFor({ timeout: 30_000 }).catch(() => {});
await page.getByText('Ethereum Sepolia').first().waitFor({ timeout: 45_000 }).catch(() => {});
await page.waitForTimeout(4000);
await shot('01a-home-top', false);
await page.locator(id('home-markets')).scrollIntoViewIfNeeded();
await shot('01b-home-markets', false);
// In-app navigation (real stack, back button visible).
await page.locator(id('markets-all')).click();
await page.locator(`${id('markets')} ${id('market-BTCUSDT')}`).waitFor({ timeout: 30_000 });
await shot('02a-markets-via-home', false);

{
await go('/markets');
await page.locator(`${id('markets')} ${id('market-BTCUSDT')}`).waitFor({ timeout: 30_000 });
await shot('02-markets-sort-volume');
await page.locator(`${id('markets')} `+id('sort-volume')).click();
await shot('03-markets-sort-volume-asc');
await page.locator(`${id('markets')} `+id('sort-price')).click();
await shot('04-markets-sort-price');
await page.locator(`${id('markets')} `+id('sort-change')).click();
await shot('05-markets-sort-change');
await page.locator(`${id('markets')} ${id('fav-ETHUSDT')}`).click();
await page.locator(`${id('markets')} ${id('fav-SOLUSDT')}`).click();
await page.locator(id('markets')).getByText(/^Favorites/).click();
await shot('06-markets-favorites');
await page.locator(id('markets')).getByText('All', { exact: true }).click();
await page.locator(id('markets-search')).last().fill('do');
await shot('07-markets-search');
await page.locator(id('markets-search')).last().fill('zzz');
await shot('08-markets-search-empty');
await page.locator(id('markets-search')).last().fill('');
await page.locator(id('markets')).getByText('Stablecoins', { exact: true }).click();
await shot('09-markets-stablecoins');

await go('/markets/ETHUSDT');
await page.locator(id('market-price')).last().waitFor({ timeout: 30_000 });
for (const r of ['1D', '1W', '1M', '1Y', '5Y']) {
  await page.locator(id('interval')).last().getByText(r, { exact: true }).click();
  await page.locator(id('kline-chart')).last().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(`10-detail-${r}`);
}

await go('/token/sepolia/native');
await page.locator(id('token-market')).last().waitFor({ timeout: 30_000 });
await page.waitForTimeout(3000);
await shot('11-token-detail-eth');
await go('/token/sepolia/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
await page.waitForTimeout(3000);
await shot('12-token-detail-usdc');
await go('/settings/currency');
await shot('13-settings-currency');

// Offline: browser offline event → NetInfo isConnected=false → socket paused, offline labels.
await go('/markets/ETHUSDT');
await page.locator(id('market-price')).last().waitFor({ timeout: 30_000 });
await ctx.setOffline(true);
console.log('navigator.onLine', await page.evaluate(() => navigator.onLine));
await page.waitForTimeout(35_000);
await shot('14-detail-offline');
await go('/markets');
await shot('15-markets-offline');
await ctx.setOffline(false);

}
// Stale (>=120s) is not forced here: on Chromium neither page.routeWebSocket nor CDP URL blocking cut the
// live Binance stream, so the label stayed truthfully 'Live'. Stale logic is covered by unit tests.
console.log('pageerrors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
