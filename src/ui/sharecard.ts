// 共有カード（1200×630）を Canvas で描く。3人を1枚に並べる。

import type { GameState } from '../sim/engine';
import { EDU_LABEL } from '../sim/engine';
import * as S from '../sim/stats';
import { yen } from './format';

const ERA = [
  { bg: '#efe4cc', ink: '#2a1f14', sub: '#6b5641', acc: '#a63a24', font: '"Shippori Mincho", serif', label: '活版と紙' },
  { bg: '#fff0f6', ink: '#2b1830', sub: '#7a4b7a', acc: '#e0367a', font: '"M PLUS Rounded 1c", sans-serif', label: 'ブラウン管' },
  { bg: '#f5f7fb', ink: '#10162b', sub: '#4f5873', acc: '#3554e8', font: '"Zen Kaku Gothic New", sans-serif', label: 'フラット' },
];

export async function drawShareCard(c: HTMLCanvasElement, st: GameState, portrait = false): Promise<void> {
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* noop */
  }
  if (portrait) return drawPortrait(c, st);
  c.width = 1200;
  c.height = 630;
  const g = c.getContext('2d');
  if (!g) return;
  const W = 1200;
  const H = 630;
  g.fillStyle = '#15130f';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f3eadb';
  g.font = '800 34px "Shippori Mincho", serif';
  g.textBaseline = 'top';
  g.fillText('同じ私が、三つの時代に生まれた。', 48, 36);
  g.font = '400 18px "Zen Kaku Gothic New", sans-serif';
  g.fillStyle = '#bfb39f';
  g.fillText(`${S.PREFS[st.shared.pref - 1]}・${st.shared.sex === 'male' ? '男' : '女'}　生まれ年ガチャ`, 48, 86);

  const colW = (W - 48 * 2 - 24 * 2) / 3;
  st.persons.forEach((p, i) => {
    const e = ERA[i];
    const x = 48 + i * (colW + 24);
    const y = 130;
    const h = 450;
    g.fillStyle = e.bg;
    roundRect(g, x, y, colW, h, 18);
    g.fill();
    if (i === 1) {
      g.fillStyle = 'rgba(0,0,0,0.035)';
      for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, colW, 1);
    }
    g.fillStyle = e.sub;
    g.font = `400 16px ${e.font}`;
    g.fillText(`${p.birthYear}–${p.deathYear ?? ''}`, x + 22, y + 22);
    g.fillStyle = e.ink;
    g.font = `800 64px ${e.font}`;
    g.fillText(`享年${p.deathAge ?? '−'}`, x + 20, y + 48);
    g.font = `700 20px ${e.font}`;
    g.fillText(p.name, x + 22, y + 128);
    g.font = `400 17px ${e.font}`;
    const lines = [
      `死因：${p.deathCause ?? ''}`,
      `学歴：${EDU_LABEL[p.edu]}`,
      `仕事：${p.jobTitle || 'なし'}`,
      `生涯年収：${yen(p.lifetimeEarningsReal)}`,
      p.pensionStartAge !== undefined ? `年金：${p.pensionStartAge}歳から月${yen(p.pensionMonthlyReal ?? 0)}` : '年金：受け取る前に死去',
    ];
    lines.forEach((t, k) => {
      g.fillStyle = k === 0 ? e.acc : e.ink;
      wrap(g, t, x + 22, y + 172 + k * 34, colW - 44);
    });
    const miss = p.wishes.filter((w) => !w.ok).length;
    g.fillStyle = e.sub;
    g.font = `400 15px ${e.font}`;
    g.fillText(miss ? `叶わなかった望み：${miss}つ` : '望みはおおむね叶った', x + 22, y + h - 40);
  });
  g.fillStyle = '#8a7f6d';
  g.font = '400 14px "Zen Kaku Gothic New", sans-serif';
  g.fillText('日本の統計（人口動態統計・生命表・学校基本調査ほか）でシミュレーション。2026年より先は推計。', 48, 596);
}

/** スマホ向けの縦長（1080×1350）。3人を縦に積む */
function drawPortrait(c: HTMLCanvasElement, st: GameState): void {
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext('2d');
  if (!g) return;
  const W = 1080;
  g.fillStyle = '#15130f';
  g.fillRect(0, 0, W, 1350);
  g.textBaseline = 'top';
  g.fillStyle = '#f3eadb';
  g.font = '800 54px "Shippori Mincho", serif';
  g.fillText('同じ私が、', 60, 56);
  g.fillText('三つの時代に生まれた。', 60, 124);
  g.font = '400 28px "Zen Kaku Gothic New", sans-serif';
  g.fillStyle = '#bfb39f';
  g.fillText(`${S.PREFS[st.shared.pref - 1]}・${st.shared.sex === 'male' ? '男' : '女'}　生まれ年ガチャ`, 60, 204);
  st.persons.forEach((p, i) => {
    const e = ERA[i];
    const x = 60;
    const y = 270 + i * 340;
    const w = W - 120;
    const h = 316;
    g.fillStyle = e.bg;
    roundRect(g, x, y, w, h, 24);
    g.fill();
    if (i === 1) {
      g.fillStyle = 'rgba(0,0,0,0.035)';
      for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
    }
    g.fillStyle = e.sub;
    g.font = `400 26px ${e.font}`;
    g.fillText(`${p.birthYear}–${p.deathYear ?? ''}　${p.name}`, x + 32, y + 26);
    g.fillStyle = e.ink;
    g.font = `800 96px ${e.font}`;
    g.fillText(`享年${p.deathAge ?? '−'}`, x + 28, y + 64);
    g.font = `400 28px ${e.font}`;
    const lines = [
      `${p.deathCause ?? ''}・${EDU_LABEL[p.edu]}・${p.jobTitle || '仕事なし'}`,
      `生涯年収 ${yen(p.lifetimeEarningsReal)}`,
      p.pensionStartAge !== undefined ? `年金 ${p.pensionStartAge}歳から月${yen(p.pensionMonthlyReal ?? 0)}` : '年金を受け取る前に死去',
    ];
    lines.forEach((t, k) => {
      g.fillStyle = k === 0 ? e.acc : e.ink;
      wrap(g, t, x + 32, y + 184 + k * 40, w - 64);
    });
  });
  g.fillStyle = '#8a7f6d';
  g.font = '400 22px "Zen Kaku Gothic New", sans-serif';
  g.fillText('日本の統計でシミュレーション。2026年より先は推計。', 60, 1300);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number): void {
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > max) {
      g.fillText(line, x, y);
      return;
    }
    line += ch;
  }
  g.fillText(line, x, y);
}

export function shareText(st: GameState): string {
  const pref = S.PREFS[st.shared.pref - 1];
  const rows = st.persons.map((p) => {
    const pen = p.pensionStartAge !== undefined ? `年金${p.pensionStartAge}歳から月${yen(p.pensionMonthlyReal ?? 0)}` : '年金の前に死去';
    return `${p.birthYear}年生まれ：享年${p.deathAge}、${EDU_LABEL[p.edu]}、生涯年収${yen(p.lifetimeEarningsReal)}、${pen}`;
  });
  return `同じ私が、三つの時代に生まれた（${pref}・${st.shared.sex === 'male' ? '男' : '女'}）。\n${rows.join('\n')}\n#生まれ年ガチャ`;
}
