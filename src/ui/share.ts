// X（旧Twitter）で共有する。投稿画面を開き、文章とリンクを入れておく（ログインや連携は要らない）。
// リンクを貼ると、index.html の OGP（og:image）からカードの画像が出る。

import type { GameState } from '../sim/engine';
import { eduLabelOf } from '../sim/engine';
import * as S from '../sim/stats';
import { eraName, wareki } from './format';

export const SITE_URL = 'https://umaredoshi.margheritaworks.com/';
export const HASHTAG = '生まれ年ガチャ';

/** X の文字数の数え方：半角などは1、日本語などは2。URL は23 */
function weight(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const light = c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
    w += light ? 1 : 2;
  }
  return w;
}

/** 280の枠に収まるように、本文を切る（URL・ハッシュタグの分を引く） */
function fit(text: string): string {
  const room = 280 - 23 - 1 - weight(`#${HASHTAG}`) - 2;
  if (weight(text) <= room) return text;
  let out = '';
  for (const ch of text) {
    if (weight(out + ch + '…') > room) break;
    out += ch;
  }
  return out + '…';
}

/** アプリの共有画面（画像付き）に渡す文章。X の上限に収めた本文に、リンクとハッシュタグを足す */
export function xShareText(text: string, url = SITE_URL): string {
  return `${fit(text)}\n${url}\n#${HASHTAG}`;
}

export function xIntentUrl(text: string, url = SITE_URL): string {
  const q = new URLSearchParams({ text: fit(text), url, hashtags: HASHTAG });
  return `https://x.com/intent/tweet?${q.toString()}`;
}

export function openX(text: string, url = SITE_URL): void {
  window.open(xIntentUrl(text, url), '_blank', 'noopener,noreferrer');
}

const sexWord = (st: GameState) => (st.shared.sex === 'male' ? '男' : '女');

/** 生まれたとき */
export function birthXText(st: GameState): string {
  const ys = st.persons.map((p) => `${p.birthYear}年の${S.placeShort(p.pref, p.birthYear)}`).join('、');
  return `${ys}に、${st.shared.sex === 'male' ? '男の子' : '女の子'}が生まれた。\n同じ私の、三つの人生が始まる。`;
}

/** 確率を「約52億分の1」のように書く（1/確率を丸める） */
export function oddsText(prob: number | undefined): string {
  if (!prob || !(prob > 0)) return '';
  const n = 1 / prob;
  const round = (v: number) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  if (n >= 1e12) return `約${round(n / 1e12).toLocaleString('ja-JP')}兆分の1`;
  if (n >= 1e8) return `約${round(n / 1e8).toLocaleString('ja-JP')}億分の1`;
  if (n >= 1e4) return `約${round(n / 1e4).toLocaleString('ja-JP')}万分の1`;
  return `約${Math.round(n).toLocaleString('ja-JP')}分の1`;
}

/**
 * 一生を終えたとき。遊んだ人が結果をそのまま投稿したくなるように、
 * 時代の名前（江戸・昭和・平成など）、元号と生まれた場所、享年と仕事、組み合わせの珍しさを並べる（2026-10-15）
 */
export function endXText(st: GameState, okuri?: string): string {
  const eras = st.persons.map((p) => eraName(p.birthYear)).join('・');
  const head = `【生まれ年ガチャ】同じ私が、${eras}に生まれた（${sexWord(st)}）`;
  const rows = st.persons.map((p) => {
    const what = (p.deathAge ?? 99) >= 15 ? `・${p.jobTitle && p.jobTitle !== '無職' ? p.jobTitle : eduLabelOf(p)}` : '';
    return `${wareki(p.birthYear)}・${S.placeShort(p.pref, p.birthYear)}：享年${p.deathAge ?? '−'}${what}`;
  });
  const odds = oddsText(st.gacha.comboProb);
  const ages = st.persons.map((p) => p.deathAge ?? 0);
  const gap = Math.max(...ages) - Math.min(...ages);
  const tail = odds ? `この組み合わせは${odds}。` : gap >= 10 ? `寿命の差は${gap}年。` : '';
  const msg = okuri && okuri.trim() ? `\n「${okuri.trim()}」` : '';
  return `${head}\n${rows.join('\n')}\n${tail}人生を分けたのは、生まれた年だった。${msg}`;
}

/** トップページから */
export const TITLE_X_TEXT = '同じ私が、三つの時代に生まれたら。進学も結婚も寿命も年金も、日本の実際の統計で決まる人生シミュレーション。';
