// 主要画面のスクリーンショットを撮る（スマホ 390×844、PC 1440×900）。
// 使い方：npm run build && npx vite preview --port 4173 & node scripts/screenshots.mjs [出力フォルダ]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] || 'docs/screenshots';
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:4173/';
const pages = [
  ['01_title', ''],
  ['02_birth', '?demo=birth&seed=12345'],
  ['03_life', '?demo=life&seed=12345&age=24'],
  ['04_decision', '?demo=decision&seed=12345&age=18'],
  ['05_result', '?demo=decision&seed=12345&age=18', 'result'],
  ['06_end', '?demo=end&seed=12345'],
  ['07_gacha', '?demo=gacha&seed=12345', 'wait'],
  ['08_breath', '?demo=decision&seed=12345&age=6'],
  ['09_log', '?demo=life&seed=12345&age=30', 'log'],
  ['10_help', '', 'help'],
  ['11_life_scrolled', '?demo=life&seed=12345&age=40', 'scroll'],
];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
for (const [vw, vh, tag] of [[390, 844, 'sp'], [1440, 900, 'pc']]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: tag === 'sp' ? 2 : 1, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const [name, q, action] of pages) {
      if (scheme === 'dark' && !['01_title', '03_life', '06_end'].includes(name)) continue;
      await page.goto(base + q, { waitUntil: 'networkidle' });
      await page.waitForTimeout(name === '03_life' ? 1500 : 900);
      if (action === 'wait') await page.waitForTimeout(1600);
      if (action === 'scroll') {
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForTimeout(500);
      }
      if (action === 'log') {
        await page.click('#col1');
        await page.waitForTimeout(600);
      }
      if (action === 'help') {
        await page.click('[data-act="help"]');
        await page.waitForTimeout(600);
      }
      if (action === 'result') {
        await page.locator('.opt:not([disabled])').first().click();
        await page.waitForTimeout(1200);
      }
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (sw > 0) errors.push(`${name}: 横スクロール ${sw}px`);
      await page.screenshot({ path: `${out}/${name}_${tag}_${scheme}.png`, fullPage: name === '06_end' || name === '02_birth' });
    }
    if (errors.length) console.log(tag, scheme, errors.join('\n'));
    await ctx.close();
  }
}
await browser.close();
console.log('done');
