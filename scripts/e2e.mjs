// タイトルから最後の画面まで、実際にクリックして通しで遊べるかを確かめる。
// 使い方：npm run build && npx vite preview --port 4173 & node scripts/e2e.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE || 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const t0 = Date.now();
await page.goto(base, { waitUntil: 'networkidle' });
await page.click('[data-act="start"]');
await page.click('#skip');
await page.waitForSelector('#go', { timeout: 20000 });
await page.click('#go');
await page.waitForSelector('#age');
// 最初の数回の決断は手で選ぶ（ひと息も含む）
let decisions = 0;
let breaths = 0;
for (let i = 0; i < 400; i++) {
  if (await page.locator('.end').count()) break;
  if (await page.locator('.slides').count()) {
    await page.click('.slides .skip', { force: true }).catch(() => {});
    continue;
  }
  const opt = page.locator('.opt:not([disabled])');
  if (await opt.count()) {
    decisions++;
    await opt.nth(decisions % (await opt.count())).click();
    await page.click('#cont');
    if (decisions === 6) await page.click('#auto'); // あとはおまかせ
    continue;
  }
  if (await page.locator('#ans').count()) {
    breaths++;
    await page.fill('#ans', 'テスト');
    await page.click('#cont');
    continue;
  }
  if (await page.locator('#next').count()) await page.click('#next').catch(() => {});
  await page.waitForTimeout(250);
}
await page.waitForSelector('.end', { timeout: 120000 });
const records = await page.locator('.record').count();
const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(JSON.stringify({ ok: records === 3 && errors.length === 0 && sw <= 0, records, decisions, breaths, seconds: Math.round((Date.now() - t0) / 1000), errors, horizontalScroll: sw }));
await browser.close();
