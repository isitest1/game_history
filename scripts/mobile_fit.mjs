// スマホで実際に遊びながら、次の3つを毎年確かめる。
// 1. 一番上（スクロール0）で、最新の年齢の見出しと3列の書き出しが、上の帯と見出しに隠れずに見える
// 2. 指で下へ送り、また上へ戻しても、上の帯の高さが変わらず、出来事の位置が飛ばない
// 3. 上へ戻しきると、最新の年齢がまた見える
// あわせて、3人分がすべて一画面に収まった年の割合（all3）を数える（その年のことは全部並べるので、収まらない年もある）
// 使い方：npm run build && npx vite preview --port 4173 & node scripts/mobile_fit.mjs [画面の高さ,...]
import { chromium } from '@playwright/test';

const base = process.env.BASE || 'http://localhost:4173/';
const heights = (process.argv[2] || '600,664,700,767').split(',').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });

/** 最新の年齢の3人分が、帯と操作バーの間に収まっているか */
async function measure(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.mrow');
    if (!row) return null;
    const bar = document.querySelector('.agebar').getBoundingClientRect();
    const colsEl = document.querySelector('.cols');
    const cols = colsEl.getBoundingClientRect();
    const ch = document.querySelector('.mcolhead');
    const top = Math.max(bar.bottom, ch ? ch.getBoundingClientRect().bottom : 0, getComputedStyle(colsEl).display === 'none' ? 0 : cols.bottom);
    const ctr = document.querySelector('.controls').getBoundingClientRect();
    const lines = [...row.querySelectorAll('.mcell')].map((e) => e.getBoundingClientRect());
    const head = row.querySelector('.mage').getBoundingClientRect();
    return {
      scrollY: Math.round(window.scrollY),
      colsH: Math.round(top),
      colsBottom: Math.round(top),
      controlsTop: Math.round(ctr.top),
      rowTop: Math.round(head.top),
      rowDocTop: Math.round(head.top + window.scrollY),
      linesBottom: Math.round(Math.max(...lines.map((r) => r.bottom))),
      fits: head.top >= top - 1 && lines[0].top <= ctr.top - 60,
      all3: head.top >= top - 1 && Math.max(...lines.map((r) => r.bottom)) <= ctr.top + 1,
      age: row.querySelector('.mage').firstChild.textContent,
    };
  });
}

const problems = [];
const summary = [];
for (const h of heights) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.click('[data-act="start"]');
  await page.click('#skip');
  await page.waitForSelector('#go', { timeout: 20000 });
  await page.click('#go');
  await page.waitForSelector('#age');
  // 決断はおまかせ（「質問」ボタンから選ぶ）
  await page.click('#qbtn');
  await page.click('[data-q="auto"]');
  let checked = 0;
  let all3 = 0;
  let maxScroll = 0;
  let lastAge = '';
  for (let i = 0; i < 600; i++) {
    if (await page.locator('.end').count()) break;
    if (await page.locator('.slides').count()) {
      await page.click('.slides .skip', { force: true }).catch(() => {});
      continue;
    }
    if (await page.locator('#ans').count()) {
      await page.fill('#ans', 'テスト');
      await page.click('#cont');
      continue;
    }
    if (await page.locator('.sheet').count()) {
      await page.click('#cont').catch(() => {});
      await page.waitForTimeout(150);
      continue;
    }
    const m0 = await measure(page);
    if (m0 && m0.age !== lastAge) {
      lastAge = m0.age;
      // 一時停止して確かめる
      const pp = page.locator('#pp');
      const wasPlaying = (await pp.getAttribute('aria-pressed')) !== 'true';
      if (wasPlaying) await pp.click({ timeout: 2000 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
      const top = await measure(page);
      if (!top.fits) problems.push({ h, at: 'top', ...top });
      if (top.all3) all3++;
      // 指で少しずつ下へ送り、また上へ戻す
      const seen = [];
      for (const dy of [30, 30, 60, 120, -120, -60, -30, -30, -200]) {
        await page.mouse.wheel(0, dy);
        await page.waitForTimeout(80);
        const m = await measure(page);
        if (m) seen.push(m);
      }
      maxScroll = Math.max(maxScroll, ...seen.map((m) => m.scrollY));
      const colsHs = new Set(seen.map((m) => m.colsH));
      const docTops = new Set(seen.map((m) => m.rowDocTop));
      if (colsHs.size > 1 || docTops.size > 1) problems.push({ h, at: 'scroll-jump', age: top.age, colsHs: [...colsHs], docTops: [...docTops] });
      const back = seen[seen.length - 1];
      if (back.scrollY !== 0 || !back.fits) problems.push({ h, at: 'back-to-top', ...back });
      checked++;
      if (wasPlaying) await pp.click({ timeout: 2000 }).catch(() => {});
    }
    if (await page.locator('#next').count()) await page.click('#next', { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
  const ended = (await page.locator('.end').count()) > 0;
  summary.push({ h, checked, ended, maxScroll, all3Share: +(all3 / Math.max(1, checked)).toFixed(2) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ ok: problems.length === 0 && summary.every((s) => s.ended && s.checked > 20), summary, problems: problems.slice(0, 20), problemCount: problems.length }));
