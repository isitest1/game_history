// 列の上やトップページに描く、その年・その土地の風景（SVG、自作）。
// 時代で空の色と建物が変わり、土地で地形が変わる。
// - 時代：〜1955 セピア色の木造の町／1956〜73 高度成長の団地と煙突／1974〜90 夕暮れのネオン／1991〜2010 明るいビル街／2011〜2026 夕方の高層ビル／2027〜 線画（推計の時代）
// - 土地：大都市圏か地方か（田んぼと山）、雪の多い県、沖縄（海とヤシと赤瓦）、富士山の見える県（静岡・山梨）、東京（東京タワー1958〜、スカイツリー2012〜）
// 戦争や災害の場面は描かない。

const METRO = new Set([11, 12, 13, 14, 23, 26, 27, 28]);
const SNOW = new Set([1, 2, 3, 4, 5, 6, 7, 15, 16, 17, 18, 20, 31]);

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Pal {
  sky: [string, string, string];
  sun: string;
  far: string; // 遠くの山
  mid: string; // 中くらいの建物
  near: string; // 手前の建物
  win: string; // 窓の明かり
  roof: string;
  ground: string;
  accent: string;
  line?: boolean; // 線画（未来）
}

function palette(year: number): Pal {
  if (year > 2026) return { sky: ['#f4f6fb', '#eef1f8', '#e6ebf5'], sun: '#ffffff', far: '#c7cfdf', mid: '#9aa6c0', near: '#7b88a6', win: '#ffffff', roof: '#9aa6c0', ground: '#dfe5f0', accent: '#8fa2d6', line: true };
  if (year < 1956) return { sky: ['#efe3c6', '#e6d3ad', '#d9c095'], sun: '#fbf2da', far: '#b9a07a', mid: '#8a6d4c', near: '#5d4631', win: '#f3dfa8', roof: '#4a3626', ground: '#a88b62', accent: '#9a4b32' };
  if (year < 1974) return { sky: ['#a9cfe0', '#e9dcc0', '#f4cf98'], sun: '#fff4d6', far: '#8fa7ae', mid: '#c9b38f', near: '#8c6f57', win: '#fff1c2', roof: '#9b3d2c', ground: '#9a8a6a', accent: '#d8562f' };
  if (year < 1991) return { sky: ['#2c2150', '#b5557a', '#f3a37c'], sun: '#ffd8a0', far: '#5b3f6e', mid: '#45305e', near: '#2a1d3d', win: '#ffd27a', roof: '#2a1d3d', ground: '#24182f', accent: '#ff5fa2' };
  if (year < 2011) return { sky: ['#8fcdf0', '#c8e8fa', '#eef8ff'], sun: '#ffffff', far: '#a9c4d6', mid: '#8ea7bf', near: '#5f7894', win: '#eaf6ff', roof: '#5f7894', ground: '#94a8b8', accent: '#2f7fd0' };
  return { sky: ['#14213f', '#33528a', '#a7bde0'], sun: '#ffe9c4', far: '#3a4f78', mid: '#2b3b5e', near: '#1b2642', win: '#d6e8ff', roof: '#1b2642', ground: '#18213a', accent: '#7fb2ff' };
}

export function sceneSvg(year: number, pref = 13): string {
  const W = 320;
  const H = 110;
  const G = 96; // 地面の高さ
  const r = rng(Math.floor(year / 2) * 131 + pref * 17 + 7);
  const P = palette(year);
  const city = METRO.has(pref);
  const snow = SNOW.has(pref) && r() < 0.6;
  const okinawa = pref === 47;
  const fuji = pref === 22 || pref === 19;
  const tokyo = pref === 13;
  const id = `g${year}${pref}`;
  const fillOrLine = (c: string) => (P.line ? `fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="3 2"` : `fill="${c}"`);
  const out: string[] = [];

  // 空
  out.push(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}"/><stop offset=".6" stop-color="${P.sky[1]}"/><stop offset="1" stop-color="${P.sky[2]}"/></linearGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`);
  // 太陽か月
  const sx = 40 + r() * 240;
  out.push(`<circle cx="${sx}" cy="${26 + r() * 14}" r="${year >= 2011 && year <= 2026 ? 7 : 11}" fill="${P.sun}" opacity="${year >= 1974 && year < 1991 ? 0.9 : 0.75}"/>`);
  // 星（夜の時代）
  if ((year >= 2011 && year <= 2026) || (year >= 1974 && year < 1991)) {
    for (let i = 0; i < 14; i++) out.push(`<circle cx="${r() * W}" cy="${r() * 34}" r="${0.5 + r() * 0.7}" fill="#fff" opacity="${0.3 + r() * 0.5}"/>`);
  }
  // 雲
  if (!P.line && year >= 1956 && (year < 1974 || (year >= 1991 && year < 2011))) {
    for (let i = 0; i < 3; i++) {
      const cx = r() * W;
      const cy = 14 + r() * 22;
      out.push(`<g fill="#fff" opacity=".7"><ellipse cx="${cx}" cy="${cy}" rx="${16 + r() * 14}" ry="5"/><ellipse cx="${cx + 8}" cy="${cy - 4}" rx="${9 + r() * 6}" ry="5"/></g>`);
    }
  }

  // 遠景：山・富士山・海
  if (okinawa) {
    out.push(`<rect x="0" y="${G - 22}" width="${W}" height="24" fill="${P.line ? 'none' : '#3fa7c4'}" opacity=".55"/>`);
    for (let i = 0; i < 5; i++) out.push(`<rect x="${r() * W}" y="${G - 18 + r() * 12}" width="${10 + r() * 20}" height="1" fill="#fff" opacity=".6"/>`);
  } else {
    let path = `M0 ${G - 18}`;
    for (let x = 0; x <= W; x += 20) path += ` L${x} ${G - 22 - (city ? 6 : 18) * (0.4 + r())}`;
    path += ` L${W} ${G} L0 ${G}Z`;
    out.push(`<path d="${path}" ${fillOrLine(P.far)} opacity=".75"/>`);
    if (fuji) {
      const fx = 60 + r() * 200;
      out.push(`<path d="M${fx - 60} ${G - 14} L${fx - 12} ${G - 64} L${fx + 12} ${G - 64} L${fx + 60} ${G - 14}Z" ${fillOrLine(P.far)}/>`);
      out.push(`<path d="M${fx - 12} ${G - 64} L${fx + 12} ${G - 64} L${fx + 22} ${G - 52} L${fx + 8} ${G - 56} L${fx - 2} ${G - 50} L${fx - 10} ${G - 56} L${fx - 22} ${G - 52}Z" fill="#fff" opacity=".9"/>`);
    }
  }

  // 中景と近景：時代ごとの建物
  const win = (bx: number, by: number, bw: number, bh: number, gap = 5, p = 0.55) => {
    if (P.line) return;
    for (let yy = by + 4; yy < by + bh - 3; yy += gap) for (let xx = bx + 3; xx < bx + bw - 3; xx += gap) if (r() < p) out.push(`<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="2" height="2.4" fill="${P.win}" opacity=".9"/>`);
  };
  const house = (x: number, w: number, h: number, c: string, roof: string) => {
    out.push(`<rect x="${x}" y="${G - h}" width="${w}" height="${h}" ${fillOrLine(c)}/>`);
    out.push(`<path d="M${x - 3} ${G - h} L${x + w / 2} ${G - h - 8 - w * 0.12} L${x + w + 3} ${G - h}Z" ${fillOrLine(roof)}/>`);
    if (snow && !P.line) out.push(`<path d="M${x - 3} ${G - h} L${x + w / 2} ${G - h - 8 - w * 0.12} L${x + w + 3} ${G - h} L${x + w} ${G - h + 2} L${x + w / 2} ${G - h - 5 - w * 0.12} L${x} ${G - h + 2}Z" fill="#fff"/>`);
    if (!P.line && r() < 0.6) out.push(`<rect x="${x + w * 0.3}" y="${G - h * 0.6}" width="${w * 0.22}" height="${h * 0.3}" fill="${P.win}" opacity=".8"/>`);
  };
  const pole = (x: number) => {
    out.push(`<rect x="${x}" y="${G - 40}" width="1.6" height="40" fill="${P.near}" opacity=".9"/><rect x="${x - 6}" y="${G - 36}" width="13" height="1.4" fill="${P.near}" opacity=".9"/>`);
  };
  const tree = (x: number, s = 1) => {
    if (okinawa) {
      out.push(`<path d="M${x} ${G} Q${x + 2} ${G - 14 * s} ${x + 1} ${G - 24 * s}" stroke="${P.near}" stroke-width="1.6" fill="none"/>`);
      for (const a of [-1, -0.4, 0.4, 1]) out.push(`<path d="M${x + 1} ${G - 24 * s} q${10 * a} ${-4 * s} ${16 * a} ${4 * s}" stroke="#2f7d4f" stroke-width="2" fill="none"/>`);
    } else {
      out.push(`<rect x="${x - 0.8}" y="${G - 10 * s}" width="1.6" height="${10 * s}" fill="${P.near}"/><ellipse cx="${x}" cy="${G - 14 * s}" rx="${6 * s}" ry="${7 * s}" ${fillOrLine(snow ? '#e9eef2' : P.line ? P.mid : '#4f7a4a')} opacity=".9"/>`);
    }
  };

  if (!city) {
    // 地方：田んぼ・畑と、ゆとりのある家並み。時代が進むと道と家が増える
    if (!P.line && !okinawa) for (let i = 0; i < 4; i++) out.push(`<rect x="0" y="${G - 2 + i * 3}" width="${W}" height="1" fill="${snow ? '#ffffff' : year < 1974 ? '#7d9a4a' : '#6f8f55'}" opacity=".5"/>`);
    let x = r() * 20;
    while (x < W) {
      const w = 22 + r() * 18;
      if (r() < 0.62) {
        const h = 10 + r() * (year < 1974 ? 8 : 14);
        if (okinawa) {
          out.push(`<rect x="${x}" y="${G - h}" width="${w}" height="${h}" ${fillOrLine(year < 1974 ? '#d9cbb0' : '#e6e1d6')}/>`);
          out.push(`<rect x="${x - 2}" y="${G - h - 4}" width="${w + 4}" height="4" ${fillOrLine(year < 1980 ? '#c4553b' : '#9aa6b0')}/>`);
        } else if (year >= 1991 && r() < 0.35) {
          out.push(`<rect x="${x}" y="${G - h - 8}" width="${w}" height="${h + 8}" ${fillOrLine(P.mid)}/>`);
          win(x, G - h - 8, w, h + 8, 5, 0.4);
        } else house(x, w, h, P.mid, P.roof);
      } else if (r() < 0.5) tree(x + w / 2, 1 + r() * 0.4);
      else if (year < 1991 && !okinawa && r() < 0.6) pole(x + w / 2);
      x += w + 4 + r() * 10;
    }
  } else {
    // 大都市圏
    let x = -4;
    while (x < W) {
      let w = 0;
      if (year < 1956) {
        w = 22 + r() * 18;
        house(x, w - 3, 12 + r() * 9, P.mid, P.roof);
        if (r() < 0.3) pole(x + w - 1);
      } else if (year < 1974) {
        if (r() < 0.45) {
          w = 34 + r() * 22;
          const h = 26 + r() * 18;
          out.push(`<rect x="${x}" y="${G - h}" width="${w - 4}" height="${h}" ${fillOrLine(P.mid)}/>`);
          win(x, G - h, w - 4, h, 6, 0.7);
          if (r() < 0.7) out.push(`<path d="M${x + w / 2} ${G - h} v-8 M${x + w / 2 - 6} ${G - h - 6} h12 M${x + w / 2 - 4} ${G - h - 3} h8" stroke="${P.near}" stroke-width="1"/>`);
        } else if (r() < 0.25) {
          w = 18;
          out.push(`<rect x="${x + 6}" y="${G - 52}" width="5" height="52" ${fillOrLine(P.near)}/>`);
          if (!P.line) out.push(`<path d="M${x + 8} ${G - 54} q8 -8 4 -16 q-6 -6 4 -12" stroke="#d8d2c8" stroke-width="4" fill="none" opacity=".6" stroke-linecap="round"/>`);
        } else {
          w = 22 + r() * 14;
          house(x, w - 3, 13 + r() * 6, P.near, P.roof);
        }
      } else if (year < 1991) {
        w = 22 + r() * 22;
        const h = 24 + r() * 36;
        out.push(`<rect x="${x}" y="${G - h}" width="${w - 3}" height="${h}" ${fillOrLine(r() < 0.5 ? P.mid : P.near)}/>`);
        win(x, G - h, w - 3, h, 5, 0.6);
        if (!P.line && r() < 0.35) out.push(`<rect x="${x + 2}" y="${G - h + 6}" width="5" height="${Math.min(18, h - 10)}" fill="${r() < 0.5 ? P.accent : '#5ff0ff'}" opacity=".85"/>`);
      } else if (year < 2011) {
        w = 20 + r() * 22;
        const h = 30 + r() * 46;
        out.push(`<rect x="${x}" y="${G - h}" width="${w - 3}" height="${h}" ${fillOrLine(r() < 0.5 ? P.mid : P.near)}/>`);
        if (!P.line) out.push(`<rect x="${x}" y="${G - h}" width="${(w - 3) * 0.35}" height="${h}" fill="#fff" opacity=".18"/>`);
        win(x, G - h, w - 3, h, 4.5, 0.5);
      } else {
        w = 16 + r() * 18;
        const h = 36 + r() * 52;
        out.push(`<rect x="${x}" y="${G - h}" width="${w - 3}" height="${h}" ${fillOrLine(r() < 0.5 ? P.mid : P.near)}/>`);
        win(x, G - h, w - 3, h, 4, 0.55);
      }
      x += w;
    }
    // 東京の塔
    if (tokyo && year >= 1958 && year <= 2026 && !(year >= 2012)) {
      const tx = 230 + r() * 40;
      out.push(`<path d="M${tx - 9} ${G} L${tx} ${G - 86} L${tx + 9} ${G}Z M${tx - 5} ${G - 34} h10 M${tx - 3} ${G - 58} h6" ${P.line ? fillOrLine(P.accent) : `fill="none" stroke="${year < 1974 ? '#c8452c' : '#ff7a59'}" stroke-width="1.6"`}/>`);
    }
    if (tokyo && year >= 2012 && year <= 2026) {
      const tx = 240 + r() * 40;
      out.push(`<path d="M${tx - 3} ${G} L${tx} ${G - 100} L${tx + 3} ${G}Z" fill="#cfe3ff" opacity=".9"/><rect x="${tx - 4}" y="${G - 70}" width="8" height="3" fill="#cfe3ff"/><rect x="${tx - 3}" y="${G - 52}" width="6" height="2" fill="#cfe3ff"/>`);
    }
  }

  // 地面
  out.push(`<rect x="0" y="${G}" width="${W}" height="${H - G}" ${P.line ? `fill="${P.ground}"` : `fill="${snow ? '#f4f7fa' : P.ground}"`}/>`);
  if (snow && !P.line) for (let i = 0; i < 26; i++) out.push(`<circle cx="${r() * W}" cy="${r() * G}" r="${0.6 + r()}" fill="#fff" opacity=".8"/>`);
  return `<svg class="scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${out.join('')}</svg>`;
}
