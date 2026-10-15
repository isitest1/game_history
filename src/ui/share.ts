// X（旧Twitter）で共有する。投稿画面を開き、文章とリンクを入れておく（ログインや連携は要らない）。
// リンクを貼ると、index.html の OGP（og:image）からカードの画像が出る。

import type { GameState } from '../sim/engine';
import { eduLabelOf } from '../sim/engine';
import * as S from '../sim/stats';

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

/** 一生を終えたとき */
export function endXText(st: GameState, okuri?: string): string {
  const rows = st.persons.map((p) => `${p.birthYear}年・${S.placeShort(p.pref, p.birthYear)}：享年${p.deathAge ?? '−'}${(p.deathAge ?? 99) >= 15 ? `・${eduLabelOf(p)}` : ''}`);
  const ages = st.persons.map((p) => p.deathAge ?? 0);
  const gap = Math.max(...ages) - Math.min(...ages);
  const head = `同じ私が、三つの時代に生まれた（${sexWord(st)}）。`;
  const tail = gap >= 10 ? `寿命の差は${gap}年。人生を分けたのは、生まれた年だった。` : '生まれた年が違うだけで、人生はこう変わった。';
  const msg = okuri && okuri.trim() ? `\n「${okuri.trim()}」` : '';
  return `${head}\n${rows.join('\n')}\n${tail}${msg}`;
}

/** トップページから */
export const TITLE_X_TEXT = '同じ私が、三つの時代に生まれたら。進学も結婚も寿命も年金も、日本の実際の統計で決まる人生シミュレーション。';
