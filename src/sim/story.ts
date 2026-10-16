// 一生の「称号」と「ひとことの一生」。共有の文章・共有カード・結果を見せるページで使う（2026-10-15）。
// 伸びた人生シミュレーターでは、遊んだ人が「○○の一生『億を築いた人』」のような短い物語を投稿して広がったため、
// この人だけの見出しと、記録から自動でまとめた1行を作る。

import { eduLabelOf, isEdo, jobLabelAt } from './engine';
import * as S from './stats';
import type { Person } from './types';

const urban = (p: Person) => S.METRO.has(p.pref);

/** その人の一生をひとことで表す見出し。目立つ出来事から順に当てはめる */
export function titleOf(p: Person, talent = ''): string {
  return titleCandidates(p, talent)[0];
}

/** 3人の称号。同じ称号が重ならないように、2番目以降の候補を使う */
export function titlesOf(persons: Person[], talent = ''): string[] {
  const used = new Set<string>();
  return persons.map((p) => {
    const t = titleCandidates(p, talent).find((c) => !used.has(c)) ?? titleOf(p, talent);
    used.add(t);
    return t;
  });
}

/** 当てはまる称号を、目立つ順にすべて並べる */
function titleCandidates(p: Person, talent: string): string[] {
  const out: string[] = [];
  const add = (t: string) => out.push(t);
  const a = p.deathAge ?? p.age;
  const y15 = p.birthYear + 15;
  const kids = p.children.length;
  const f = (k: string) => p.flags.includes(k);
  if (a < 1) add('生まれてすぐ旅立った人');
  if (a < 15) add('幼くして旅立った人');
  if (p.deathCause === '戦死' || p.deathCause === '戦病死') add('戦地から帰らなかった人');
  if (a >= 100) add('百年を生きた人');
  if (f('samurai_heir') && p.job === 'public') add('家督を継いだ武士');
  if (p.jobTitle.startsWith('部屋住み')) add('部屋住みで生きた武士の子');
  if (f('talent_bloom') && talent) add(`${talent}で名を上げた人`);
  if (f('studied_abroad')) add('海を渡って学んだ人');
  if (p.lifetimeEarningsReal >= 4e8) add('億を稼いだ人');
  if (f('group_employment')) add('集団就職で都会に出た人');
  if (p.edu === 'univ' && y15 < 1950) add('学問を修めた人');
  if (kids >= 4) add('大家族を育てた人');
  if (a >= 95) add('長寿をまっとうした人');
  if (p.movedToCity && !urban(p) && isEdo(y15)) add(`${p.pref >= 25 && p.pref !== 47 ? '大坂' : '江戸'}に出て働いた人`);
  if (f('part_time')) add(isEdo(p.birthYear + 20) ? '日雇いで食いつないだ人' : '非正規で働き抜いた人');
  if (p.marriageAge === undefined && a >= 50) add('ひとりで生き抜いた人');
  if (f('no_school')) add('学ぶ機会のなかった人');
  const job = p.job === 'none' && p.jobTitle ? p.jobTitle : p.job;
  if (job === 'farm') add('田畑とともに生きた人');
  if (job === 'self') add('商いに生きた人');
  if (job === 'public') add(/武士|士族/.test(p.jobTitle) ? '武士として生きた人' : '公に尽くした人');
  if (job === 'bigco') add(/大店|店や会社/.test(p.jobTitle) ? '大店に仕えた人' : '大きな会社で働いた人');
  if (p.jobTitle === '専業主婦' || p.jobTitle === '家の仕事') add('家を守った人');
  if (p.wishes.filter((w) => !w.ok).length >= 8) add('望みの多くが叶わなかった人');
  if (p.movedToCity && !urban(p)) add('故郷を出て都会で生きた人');
  if (job === 'smallco') add(/奉公|店や工場/.test(p.jobTitle) ? '奉公に生きた人' : '働きづめに生きた人');
  add('ふつうの一生を生きた人');
  return out;
}

/**
 * 記録から作る1行の一生。例：「播磨の百姓の家に生まれる→寺子屋で読み書き→大坂で奉公。結婚・子2人。25歳、労咳。」
 * 共有カードや結果のページに収まるように短くする
 */
export function bioOf(p: Person): string {
  const a = p.deathAge ?? p.age;
  const place = S.placeShort(p.pref, p.birthYear);
  const home = `${place}の${jobLabelAt(p.parentJob, p.birthYear).replace(/（.*）/, '')}の家に生まれる`;
  const end = p.deathAge !== undefined ? `${a}歳、${p.deathCause ?? ''}。` : '';
  if (a < 15) return `${home}。${end}`;
  const steps = [home, eduLabelOf(p)];
  const job = p.jobTitle && p.jobTitle !== '無職' ? p.jobTitle : '';
  if (job) steps.push(p.movedToCity && !urban(p) && !/主婦|家の仕事/.test(job) ? `都会で${job}` : job);
  const fam = p.marriageAge !== undefined ? `結婚${p.children.length ? `・子${p.children.length}人` : ''}` : '独身';
  return `${steps.join('→')}。${fam}。${end}`;
}

/** 結果を見せるページ用の、1人分の短いまとめ（共有のリンクに入れる） */
export interface PersonSummary {
  y: number; // 生まれ年
  m: number; // 生まれ月
  p: number; // 県
  n: string; // 名前
  d: number; // 享年
  c: string; // 死因
  t: string; // 称号
  b: string; // ひとことの一生
  e: string; // 学歴
  j: string; // 仕事
}

export interface ResultSummary {
  v: 1;
  s: 'male' | 'female';
  o?: number; // 組み合わせの確率
  r: number; // ガチャの番号
  ps: PersonSummary[];
}

export function summarize(persons: Person[], sex: 'male' | 'female', seed: number, odds: number | undefined, talent = ''): ResultSummary {
  const titles = titlesOf(persons, talent);
  return {
    v: 1,
    s: sex,
    o: odds,
    r: seed,
    ps: persons.map((p, i) => ({
      y: p.birthYear,
      m: p.birthMonth,
      p: p.pref,
      n: p.name,
      d: p.deathAge ?? p.age,
      c: p.deathCause ?? '',
      t: titles[i],
      b: bioOf(p),
      e: eduLabelOf(p),
      j: p.jobTitle || '',
    })),
  };
}

/** URL に入れられる形にする（JSON → UTF-8 → base64url） */
export function encodeSummary(s: ResultSummary): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSummary(code: string): ResultSummary | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const s = JSON.parse(new TextDecoder().decode(bytes)) as ResultSummary;
    if (s?.v !== 1 || !Array.isArray(s.ps) || s.ps.length !== 3) return null;
    for (const q of s.ps) if (typeof q.y !== 'number' || typeof q.p !== 'number' || q.p < 1 || q.p > 47 || typeof q.d !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}
