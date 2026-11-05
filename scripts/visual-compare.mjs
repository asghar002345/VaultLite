// Visual comparison: Expo web export vs approved Stitch v3 references.
// Usage:  npm run export:web && npx expo serve --port 8099 &   then   npm run visual:compare
// Env: BASE (default http://localhost:8099), REFS (default ../vaultlite-refs/stitch-v3), OUT (default visual-report)
// TESTNET ONLY: onboards with the public BIP-39 test mnemonic; never signs or broadcasts.
//
// Why a pixel diff against mockups is "drift", not pass/fail: Stitch refs are design comps
// (different fonts rasterisation, sample balances, status bar). The report ranks screens by
// mismatch so a reviewer looks at the worst first; the threshold is a soft budget.
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8099';
const REFS = path.resolve(process.env.REFS ?? '../vaultlite-refs/stitch-v3');
const OUT = path.resolve(process.env.OUT ?? 'visual-report');
const BUDGET = Number(process.env.BUDGET ?? 0.25); // soft: fraction of differing pixels
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '135790';
const TO = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0'; // index 1 of the public test mnemonic
const CONTRACT = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9'; // WETH on Sepolia → danger review

const SCREENS = [
  { ref: 'VaultLite_01_home.png', route: '/home', ready: 'home' },
  { ref: 'VaultLite_02_token_detail_eth.png', route: '/token/sepolia/native' },
  { ref: 'VaultLite_03_send_amount.png', route: '/send', ready: 'send' },
  { ref: 'VaultLite_04_send_review_sheet.png', route: '/send', fill: TO, ready: 'review-amount' },
  { ref: 'VaultLite_05_danger_review.png', route: '/send', fill: CONTRACT, ready: 'danger-block' },
  { ref: 'VaultLite_06_receive.png', route: '/receive', ready: 'receive' },
  { ref: 'VaultLite_07_activity.png', route: '/activity', ready: 'activity' },
  { ref: 'VaultLite_08_walletconnect_approval.png', route: null, skip: 'needs a live WalletConnect session request; not reproducible offline' },
  { ref: 'VaultLite_09_milestone_escrow.png', route: '/escrow', ready: 'escrow-list' },
  { ref: 'VaultLite_10_settings_security.png', route: '/settings/security', ready: 'settings-security' },
  { ref: 'VaultLite_11_pin_lock.png', route: 'LOCK', ready: 'lock' },
];

const id = (t) => `[data-testid="${t}"]`;
const readPng = (f) => PNG.sync.read(fs.readFileSync(f));

async function unlockIfNeeded(page) {
  if (await page.locator(id('lock')).isVisible().catch(() => false)) {
    for (const d of PIN) await page.locator(id(`key-${d}`)).click();
    await page.locator(id('lock')).waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  }
}

async function onboard(page) {
  await page.goto(`${BASE}/`);
  await page.locator(id('import')).click({ timeout: 30_000 });
  await page.locator(id('import-secret')).fill(MNEMONIC);
  await page.locator(id('import-continue')).click();
  await page.locator(id('pin')).fill(PIN);
  await page.locator(id('pin-confirm')).fill(PIN);
  await page.locator(id('create-vault')).click();
  await page.locator(id('home')).waitFor({ timeout: 60_000 });
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const ONLY = process.env.ONLY?.split(',');
for (const s of SCREENS.filter((x) => !ONLY || ONLY.some((o) => x.ref.includes(o)))) {
  if (!s.route) { results.push({ ...s, status: 'skipped' }); continue; }
  const ref = readPng(path.join(REFS, s.ref));
  const width = 390;
  const dpr = ref.width / width;
  const ctx = await browser.newContext({ viewport: { width, height: Math.round(ref.height / dpr) }, deviceScaleFactor: dpr, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  const name = s.ref.replace('.png', '');
  try {
    await onboard(page);
    if (s.route === 'LOCK') {
      await page.locator(id('tab-settings')).click();
      await page.locator(id('settings-lock')).click();
    } else {
      // Client-side navigation: a full reload drops the in-memory unlocked session on web.
      await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, s.route);
      await unlockIfNeeded(page);
      if (s.fill) {
        // Drive the real form so review gets the same params the app builds itself.
        await page.locator(id('send')).waitFor({ timeout: 30_000 });
        await page.getByText('ETH · Ethereum Sepolia', { exact: true }).click();
        await page.locator(id('to')).fill(s.fill);
        await page.locator(id('amount')).fill('0.001');
        await page.locator(id('send-review')).click();
      }
    }
    if (s.ready) await page.locator(id(s.ready)).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const shotFile = path.join(OUT, `${name}.actual.png`);
    await page.screenshot({ path: shotFile, animations: 'disabled' });
    const act = readPng(shotFile);
    const w = Math.min(act.width, ref.width), h = Math.min(act.height, ref.height);
    const crop = (img) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
    const a = crop(act), r = crop(ref), diff = new PNG({ width: w, height: h });
    const n = pixelmatch(r.data, a.data, diff.data, w, h, { threshold: 0.15 });
    fs.writeFileSync(path.join(OUT, `${name}.diff.png`), PNG.sync.write(diff));
    fs.copyFileSync(path.join(REFS, s.ref), path.join(OUT, `${name}.ref.png`));
    const ratio = n / (w * h);
    results.push({ ...s, status: ratio <= BUDGET ? 'within-budget' : 'over-budget', mismatch: Number(ratio.toFixed(4)), size: `${w}x${h}` });
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `${name}.error.png`) }).catch(() => {});
    results.push({ ...s, status: 'error', error: [String(e.message).split('\n')[0], ...errors.slice(0, 2)].join(' | ') });
  }
  await ctx.close();
}
await browser.close();

results.sort((x, y) => (y.mismatch ?? -1) - (x.mismatch ?? -1));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, budget: BUDGET, generatedAt: new Date().toISOString(), results }, null, 2));
const row = (r) => `<tr><td>${r.ref}</td><td>${r.status}</td><td>${r.mismatch ?? ''}</td><td>${r.error ?? r.skip ?? ''}</td>${r.mismatch !== undefined ? ['ref', 'actual', 'diff'].map((k) => `<td><img src="${r.ref.replace('.png', '')}.${k}.png" width="180"></td>`).join('') : '<td colspan=3></td>'}</tr>`;
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset=utf-8><title>VaultLite visual diff</title><style>body{font:14px system-ui;background:#111;color:#eee}td{border:1px solid #333;padding:6px;vertical-align:top}</style><h1>VaultLite vs Stitch v3</h1><p>Mismatch = fraction of pixels differing (pixelmatch threshold 0.15). Soft budget ${BUDGET}.</p><table><tr><th>Screen</th><th>Status</th><th>Mismatch</th><th>Note</th><th>Reference</th><th>Actual (web export)</th><th>Diff</th></tr>${results.map(row).join('')}</table>`);
for (const r of results) console.log(`${r.status.padEnd(13)} ${String(r.mismatch ?? '-').padEnd(7)} ${r.ref} ${r.error ?? r.skip ?? ''}`);
