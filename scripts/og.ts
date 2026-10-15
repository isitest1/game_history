// リンクを貼ったときに出るカードの画像（public/og.png、1200×630）と、ホーム画面のアイコンを作る。
// 使い方：npx vite-node scripts/og.ts （Google Fonts を読むので、ネットにつながっている必要がある）
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { sceneSvg } from '../src/ui/scene';

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', proxy });

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800&family=Shippori+Mincho:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;700&display=block">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#15130f;color:#f3eadb;font-family:"Zen Kaku Gothic New",sans-serif;overflow:hidden;position:relative}
.bg{position:absolute;left:0;right:0;bottom:0;height:170px;display:grid;grid-template-columns:repeat(3,1fr);opacity:.28;-webkit-mask-image:linear-gradient(to top,#000 30%,transparent)}
.bg svg{width:100%;height:100%}
.art{height:120px;margin:-22px -18px 10px;border-radius:18px 18px 0 0;overflow:hidden}
.art svg{width:100%;height:100%;display:block}
.l{position:absolute;left:70px;top:70px;width:560px}
.seal{display:inline-grid;place-items:center;width:46px;height:46px;border:3px solid #e2583e;color:#e2583e;border-radius:9px;font-family:"Shippori Mincho";font-weight:800;font-size:24px;transform:rotate(-6deg);margin-right:14px;vertical-align:middle}
.logo{font-family:"Shippori Mincho";font-weight:800;font-size:28px;letter-spacing:.12em;vertical-align:middle}
h1{font-family:"Shippori Mincho";font-weight:800;font-size:68px;line-height:1.28;margin-top:44px;letter-spacing:.02em}
h1 em{font-style:normal;color:#e2583e}
p{margin-top:26px;font-size:24px;line-height:1.6;color:#cfc3ad}
.cards{position:absolute;right:50px;top:70px;display:flex;gap:16px}
.c{width:170px;height:380px;border-radius:18px;padding:22px 18px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 20px 40px -18px rgba(0,0,0,.6);overflow:hidden}
.c:nth-child(1){background:#efe4cc;color:#2a1f14;font-family:"Shippori Mincho";transform:translateY(34px) rotate(-2deg)}
.c:nth-child(2){background:linear-gradient(#fff0f6,#ffe1ee);color:#2b1830;font-family:"M PLUS Rounded 1c";transform:translateY(-6px)}
.c:nth-child(3){background:#f5f7fb;color:#10162b;transform:translateY(20px) rotate(2deg)}
.c small{font-size:15px;opacity:.7;letter-spacing:.1em}
.c b{font-size:44px;font-weight:800;line-height:1}
.c .k{font-size:26px;font-weight:800}
.c .k span{display:block;font-size:14px;font-weight:400;opacity:.7;margin-bottom:4px}
.c:nth-child(1) b,.c:nth-child(1) .k{color:#2a1f14}.c:nth-child(2) b{color:#e0367a}.c:nth-child(3) b{color:#3554e8}
</style></head><body>
<div class="bg">${sceneSvg(1950, 15)}${sceneSvg(1985, 27)}${sceneSvg(2018, 13)}</div>
<div class="l"><span class="seal">生</span><span class="logo">生まれ年ガチャ</span>
<h1>同じ私が、<br>三つの時代に<br><em>生まれる。</em></h1>
<p>進学も、結婚も、寿命も、年金も。<br>日本の実際の統計で、一生を生きる。</p></div>
<div class="cards">
<div class="c"><div class="art">${sceneSvg(1945, 13)}</div><small>活版と紙</small><b>1935</b><div class="k"><span>享年</span>？</div></div>
<div class="c"><div class="art">${sceneSvg(1980, 27)}</div><small>ブラウン管</small><b>1972</b><div class="k"><span>享年</span>？</div></div>
<div class="c"><div class="art">${sceneSvg(2018, 13)}</div><small>フラット</small><b>2008</b><div class="k"><span>享年</span>？</div></div>
</div></body></html>`;

const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: 'public/og.png' });

// ホーム画面のアイコン（favicon.svg を大きく描く）
const svg: string = fs.readFileSync('public/favicon.svg', 'utf8');
for (const size of [180, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:#f3efe6">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: size === 180 ? 'public/apple-touch-icon.png' : 'public/icon-512.png', omitBackground: false });
}
await browser.close();
console.log('ok');
