// Loading-state screenshots (web export). TESTNET ONLY: public test mnemonic, never signs.
// Network is slowed with page.route so skeletons/spinners/overlays are visible.
// Usage: npm run export:web && npx expo serve --port 8099 &  then  OUT=dir node scripts/loader-shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8099';
const OUT = path.resolve(process.env.OUT ?? 'loader-shots');
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '135790';
const id = (t) => `[data-testid="${t}"]`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: process.env.MOTION ? 'no-preference' : 'reduce' });
const page = await ctx.newPage();
let delay = 0; // ms added to every network call except the app bundle
await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
  if (delay) await new Promise((r) => setTimeout(r, delay));
  await route.continue().catch(() => {});
});
const shot = async (name, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
  console.log('shot', name);
};
const go = (r) => page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, r);

await page.goto(`${BASE}/`);
await page.locator(id('import')).click({ timeout: 30_000 });
await page.locator(id('import-secret')).fill(MNEMONIC);
await page.locator(id('import-continue')).click();
await page.locator(id('pin')).fill(PIN);
await page.locator(id('pin-confirm')).fill(PIN);
delay = 15_000;
await page.locator(id('create-vault')).click();
await page.locator(id('home')).waitFor({ timeout: 60_000 });
await shot('02-home-initial-load', 800);
delay = 0;
await page.getByText('Ethereum Sepolia').first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(3000);
await shot('03-home-loaded');

delay = 15_000;
await go('/tokens');
await page.getByText('Refresh balances').last().click({ timeout: 5000 }).catch(() => {});
await shot('04-assets-refresh-cached', 500);

await go('/markets');
await shot('05-markets-initial-or-cached', 800);
await page.locator(id('markets-refresh')).last().click({ timeout: 2000 }).catch(() => console.log('no markets-refresh button'));
await shot('06-markets-user-refresh', 500);
delay = 0;

await go('/markets/ETHUSDT');
await page.locator(id('market-price')).last().waitFor({ timeout: 60_000 }).catch(() => {});
await page.locator(id('kline-chart')).last().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(1500);
delay = 15_000;
await page.locator(id('interval')).last().getByText('5Y', { exact: true }).click();
await shot('07-chart-range-switch', 700);
delay = 0;

await go('/activity');
delay = 15_000;
await page.locator('[aria-label="Refresh"], [data-testid="activity-refresh"]').last().click({ timeout: 3000 }).catch(() => {});
await shot('08-activity-refresh', 500);
delay = 0;

await go('/walletconnect/pair');
console.log('done');
await browser.close();
