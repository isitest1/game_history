// 遊んでいるあいだの描き直しの量を数える（チカチカの確認）。
// 記録が1件出るたびに、何個の要素が作り直され、何回アニメーションが始まったかを見る。
// 使い方：npm run build && npx vite preview --port 4173 & node scripts/flicker.mjs
import { chromium } from '@playwright/test';

const base = process.env.BASE || 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const out = {};
for (const [name, vp] of [
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['desktop', { width: 1440, height: 900 }],
]) {
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, ...rest });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.click('[data-act="start"]');
  await page.click('#skip');
  await page.waitForSelector('#go', { timeout: 20000 });
  await page.click('#go');
  await page.waitForSelector('#age');
  const normal = process.env.NORMAL === '1';
  if (!normal) {
    await page.click('#qbtn');
    await page.click('[data-q="auto"]');
  }
  await page.evaluate(() => {
    const w = window;
    w.__m = { removed: 0, anim: 0, entries: 0 };
    new MutationObserver((ms) => {
      for (const m of ms) w.__m.removed += [...m.removedNodes].filter((n) => n.nodeType === 1).length;
    }).observe(document.querySelector('#main'), { childList: true, subtree: true });
    document.addEventListener('animationstart', () => w.__m.anim++, true);
  });
  const t0 = Date.now();
  const before = await page.evaluate(() => document.querySelectorAll('.ment, .feed li').length);
  while (Date.now() - t0 < (normal ? 40000 : 20000)) {
    const opt = page.locator('.opt:not([disabled])');
    if (await opt.count()) await opt.first().click().catch(() => {});
    if (await page.locator('.sheet').count()) await page.click('#cont').catch(() => {});
    if (await page.locator('#ans').count()) {
      await page.fill('#ans', 'テスト');
      await page.click('#cont').catch(() => {});
    }
    await page.waitForTimeout(300);
  }
  const m = await page.evaluate(() => window.__m);
  const age = await page.evaluate(() => document.querySelector('#age')?.textContent);
  out[name] = { ...m, ageReached: age, before };
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out));
