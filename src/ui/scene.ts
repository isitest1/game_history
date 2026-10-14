// 列の上に描く、その年の町並み（シルエット）。年代で建物が変わる。
// 木造の平屋 → 団地とテレビのアンテナ → マンションとビル → 高層ビル → タワーマンション → 未来（点線＝推計）
// 戦争や災害の場面は描かない。

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function sceneSvg(year: number): string {
  const W = 320;
  const H = 64;
  const r = rng(Math.floor(year / 3) * 97 + 13);
  const parts: string[] = [];
  const ground = H - 6;
  const future = year > 2026;
  const fill = 'var(--c-ink)';
  const acc = 'var(--c-acc)';
  const op = future ? 0.22 : 0.85;
  let x = 0;
  const win = (bx: number, by: number, bw: number, bh: number, gap = 6) => {
    for (let yy = by + 4; yy < by + bh - 4; yy += gap) {
      for (let xx = bx + 3; xx < bx + bw - 4; xx += gap) {
        if (r() < 0.55) parts.push(`<rect x="${xx}" y="${yy}" width="2.2" height="2.6" fill="var(--c-bg)" opacity=".85"/>`);
      }
    }
  };
  while (x < W) {
    let w = 0;
    if (year < 1956) {
      // 木造の平屋と電柱
      w = 26 + r() * 22;
      const h = 12 + r() * 8;
      parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 3}" height="${h}" fill="${fill}" opacity="${op}"/>`);
      parts.push(`<path d="M${x - 3} ${ground - h} L${x + (w - 3) / 2} ${ground - h - 9 - r() * 4} L${x + w} ${ground - h}Z" fill="${fill}" opacity="${op}"/>`);
      if (r() < 0.35) parts.push(`<rect x="${x + w - 1}" y="${ground - 34}" width="1.6" height="34" fill="${fill}" opacity=".7"/><rect x="${x + w - 6}" y="${ground - 31}" width="11" height="1.4" fill="${fill}" opacity=".7"/>`);
    } else if (year < 1974) {
      // 団地（窓の並んだ箱）と木造、アンテナ
      if (r() < 0.55) {
        w = 46 + r() * 20;
        const h = 22 + r() * 10;
        parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 4}" height="${h}" fill="${fill}" opacity="${op}"/>`);
        win(x, ground - h, w - 4, h, 5);
      } else {
        w = 24 + r() * 14;
        const h = 12 + r() * 6;
        parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 3}" height="${h}" fill="${fill}" opacity="${op}"/><path d="M${x - 2} ${ground - h} L${x + w / 2} ${ground - h - 8} L${x + w} ${ground - h}Z" fill="${fill}" opacity="${op}"/>`);
        parts.push(`<path d="M${x + w / 2} ${ground - h - 8} v-9 M${x + w / 2 - 5} ${ground - h - 14} h10 M${x + w / 2 - 3} ${ground - h - 11} h6" stroke="${fill}" stroke-width="1" opacity=".8"/>`);
      }
    } else if (year < 1991) {
      // マンションとビル
      w = 22 + r() * 26;
      const h = 18 + r() * 26;
      parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 4}" height="${h}" fill="${fill}" opacity="${op}"/>`);
      win(x, ground - h, w - 4, h, 6);
    } else if (year < 2011) {
      // 高層ビルと携帯の基地局
      w = 18 + r() * 22;
      const h = 22 + r() * 34;
      parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 4}" height="${h}" fill="${fill}" opacity="${op}"/>`);
      win(x, ground - h, w - 4, h, 5);
      if (r() < 0.15) parts.push(`<path d="M${x + w / 2} ${ground - h} v-10" stroke="${acc}" stroke-width="1.5"/><circle cx="${x + w / 2}" cy="${ground - h - 11}" r="1.8" fill="${acc}"/>`);
    } else {
      // タワーマンションと低い家、太陽光パネル。未来は点線
      if (r() < 0.3) {
        w = 22 + r() * 10;
        const h = 44 + r() * 14;
        parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 6}" height="${h}" rx="2" fill="${fill}" opacity="${op}" ${future ? `stroke="${fill}" stroke-dasharray="2 2" stroke-opacity=".8"` : ''}/>`);
        if (!future) win(x, ground - h, w - 6, h, 4);
      } else {
        w = 24 + r() * 16;
        const h = 12 + r() * 8;
        parts.push(`<rect x="${x}" y="${ground - h}" width="${w - 4}" height="${h}" fill="${fill}" opacity="${op}" ${future ? `stroke="${fill}" stroke-dasharray="2 2" stroke-opacity=".8"` : ''}/>`);
        if (r() < 0.5) parts.push(`<path d="M${x + 2} ${ground - h - 1} l${(w - 8) / 2} -5 l${(w - 8) / 2} 5Z" fill="${acc}" opacity="${future ? 0.3 : 0.7}"/>`);
      }
      if (future && r() < 0.12) parts.push(`<path d="M${x + 4} ${ground} v-38" stroke="${fill}" stroke-width="1.2" stroke-dasharray="2 2" opacity=".7"/><path d="M${x + 4} ${ground - 38} l-7 -4 M${x + 4} ${ground - 38} l7 -4 M${x + 4} ${ground - 38} v8" stroke="${fill}" stroke-width="1.2" opacity=".7"/>`);
    }
    x += w;
  }
  // 東京タワー（1958年〜）と東京スカイツリー（2012年〜）は遠景に小さく
  if (year >= 1958 && year < 2012 && year < 2100) parts.push(`<path d="M${W - 40} ${ground} L${W - 33} ${ground - 50} L${W - 26} ${ground}Z" fill="none" stroke="${acc}" stroke-width="1.4" opacity=".75"/><path d="M${W - 37} ${ground - 22} h8" stroke="${acc}" stroke-width="1.2" opacity=".75"/>`);
  if (year >= 2012) parts.push(`<path d="M${W - 30} ${ground} L${W - 27} ${ground - 58} L${W - 24} ${ground}Z" fill="none" stroke="${acc}" stroke-width="1.3" opacity="${future ? 0.35 : 0.75}"/>`);
  parts.push(`<rect x="0" y="${ground}" width="${W}" height="1.5" fill="${fill}" opacity=".5"/>`);
  return `<svg class="scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}
