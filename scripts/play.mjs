// スマホの大きさで実際に遊び、途中の画面を撮る（確認用）。
// 使い方：preview を起動して node scripts/play.mjs [出力フォルダ] [撮る年齢をカンマ区切り]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] || 'tmp-play';
const shotAges = (process.argv[3] || '8,16,26,41,70').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base, { waitUntil: 'networkidle' });
await page.selectOption('#pby', '1985');
await page.click('[data-min="10"]');
await page.click('button[type=submit]');
await page.click('#skip');
await page.waitForSelector('#go', { timeout: 20000 });
await page.screenshot({ path: `${out}/a_birth.png` });
await page.click('#go');
await page.waitForSelector('.cols');
await page.click('#spd');
await page.click('#spd'); // ×4
const taken = new Set();
let n = 0;
for (let i = 0; i < 2000; i++) {
  if (await page.locator('.end').count()) break;
  if (await page.locator('.slides').count()) { await page.click('.slides .skip', { force: true }).catch(() => {}); continue; }
  const age = Number(await page.locator('#age').textContent().catch(() => '0'));
  for (const a of shotAges) {
    if (age >= a && !taken.has(a) && !(await page.locator('.sheet-back').count())) {
      taken.add(a);
      await page.screenshot({ path: `${out}/b_life_${a}.png` });
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/b_life_${a}_scrolled.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  const opt = page.locator('.opt:not([disabled])');
  if (await opt.count()) {
    n++;
    if (n === 3) await page.screenshot({ path: `${out}/c_decision.png` });
    await opt.nth(n % (await opt.count())).click();
    if (n === 3) await page.screenshot({ path: `${out}/c_result.png` });
    await page.click('#cont');
    continue;
  }
  if (await page.locator('#ans').count()) { await page.click('#cont'); continue; }
  if (await page.locator('[data-close]').count()) { await page.click('[data-close]'); continue; }
  await page.waitForTimeout(200);
}
await page.waitForSelector('.end', { timeout: 60000 }).catch(() => {});
await page.screenshot({ path: `${out}/d_end.png`, fullPage: true });
console.log(JSON.stringify({ errors, decisions: n, shots: [...taken] }));
await browser.close();
