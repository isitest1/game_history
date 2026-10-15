// 名前。生まれ年ごとに、その時代によくあった名前から選ぶ。
// 明治安田生命「生まれ年別の名前調査」は転載・転用に許諾が要るため、順位表そのものは使わない。
// ここに置いたのは、その時代によく見かけた一般的な名前で、順位や件数はゲームに出さない（docs/判断ログ.md）。

import type { Sex } from './types';
import type { Rng } from './rng';
import { edoNames, prewarNames } from './stats';

interface NameBin {
  from: number;
  male: string[];
  female: string[];
}

// 各区間の最初の年以降に使う。上位の名前を中心に、読みが重ならないように数個ずつ置く
const BINS: NameBin[] = [
  { from: 1930, male: ['清', '勇', '博', '実', '進', '茂'], female: ['和子', '幸子', '節子', '文子', '洋子', '美代子'] },
  { from: 1938, male: ['勝', '勇', '清', '進', '博', '武'], female: ['和子', '幸子', '節子', '洋子', '弘子', '久子'] },
  { from: 1945, male: ['勝', '清', '博', '茂', '稔', '和夫'], female: ['和子', '幸子', '洋子', '節子', '恵子', '悦子'] },
  { from: 1958, male: ['浩', '誠', '修', '隆', '博之', '茂'], female: ['恵子', '由美子', '久美子', '真由美', '明美', '典子'] },
  { from: 1965, male: ['誠', '浩', '剛', '哲也', '直樹', '健一'], female: ['由美子', '明美', '真由美', '智子', '陽子', '久美子'] },
  { from: 1971, male: ['誠', '大輔', '剛', '健一', '哲也', '直樹'], female: ['陽子', '智子', '裕子', '久美子', '恵', '純子'] },
  { from: 1988, male: ['翔太', '拓也', '大輔', '健太', '達也', '翔'], female: ['愛', '彩', '美穂', '舞', '沙織', '麻衣'] },
  { from: 1995, male: ['拓也', '翔太', '健太', '大輝', '翔', '達也'], female: ['美咲', '萌', '彩', '愛', '葵', '七海'] },
  { from: 2000, male: ['翔', '大輝', '拓海', '颯太', '海斗', '蓮'], female: ['さくら', '美咲', '優花', '葵', '陽菜', '七海'] },
];

const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本'];
const SURNAMES_OKINAWA = ['比嘉', '金城', '大城', '宮城', '新垣', '玉城', '上原', '島袋'];

export function pickSurname(rng: Rng, pref: number): string {
  return rng.pick(pref === 47 ? SURNAMES_OKINAWA : SURNAMES);
}

/** 明治・大正（1890〜1929年）。data/stats/prewar_social.json の names があればそれを使う。なければこの目安（その時代によく見かけた一般的な名前） */
const PREWAR: NameBin[] = prewarNames
  ? Object.entries(prewarNames).map(([from, v]) => ({ from: Number(from), male: v.male, female: v.female })).sort((a, b) => a.from - b.from)
  : [
      { from: 1890, male: ['正一', '金太郎', '三郎', '清', '武雄', '茂'], female: ['ハル', 'キヨ', 'ツル', 'マツ', 'ウメ', 'トメ'] },
      { from: 1912, male: ['正雄', '清', '正', '茂', '一郎', '実'], female: ['千代', '静子', '久子', '文子', 'ハナ', '芳子'] },
      { from: 1920, male: ['清', '正', '茂', '実', '勇', '博'], female: ['幸子', '文子', '静子', '和子', '久子', '節子'] },
    ];

/** 江戸後期〜明治前半（1800〜1889年）。data/stats/edo.json の names があればそれを使う。なければこの目安（その時代によく見かけた一般的な名前） */
const EDO: NameBin[] = edoNames
  ? Object.entries(edoNames).map(([from, v]) => ({ from: Number(from), male: v.male, female: v.female })).sort((a, b) => a.from - b.from)
  : [
      { from: 1790, male: ['吉兵衛', '清吉', '与助', '長五郎', '伊之助', '源蔵'], female: ['とめ', 'きく', 'はる', 'うめ', 'まつ', 'さと'] },
      { from: 1850, male: ['金次郎', '徳太郎', '亀吉', '留吉', '寅蔵', '幸助'], female: ['とら', 'ふさ', 'いと', 'なか', 'しげ', 'たけ'] },
    ];

export function pickGivenName(rng: Rng, birthYear: number, sex: Sex): string {
  if (birthYear < 1890) {
    let eb = EDO[0];
    for (const b of EDO) if (birthYear >= b.from) eb = b;
    return rng.pick(eb[sex]);
  }
  if (birthYear < 1930) {
    let pb = PREWAR[0];
    for (const b of PREWAR) if (birthYear >= b.from) pb = b;
    return rng.pick(pb[sex]);
  }
  let bin = BINS[0];
  for (const b of BINS) if (birthYear >= b.from) bin = b;
  return rng.pick(bin[sex]);
}
