// シミュレーションの中核。
// - いちばん若い生まれ年を1990〜2010年から出生数で重み付けして引き、ほかの2人は1800年までのどこかに、30年以上離して置く
// - 年齢をそろえて1年ずつ進める
// - 毎年、出来事を引き、死亡を判定する。亡くなった人の列は止まる

import { Rng, randomSeed } from './rng';
import * as S from './stats';
import { pickGivenName, pickSurname } from './names';
import { allEvents } from './events';
import { dailyLife, nameChild, nameSpouse, triggersOf } from './daily';
import type { Edu, EraId, GameEvent, Job, LogEntry, LogKind, Person, Sex, Shared } from './types';

export const ERA_LABEL = ['昭和の初め', '昭和の後半', '平成'] as const;

export type Focus = 'study' | 'friends' | 'help' | 'sports' | 'play' | 'work' | 'family' | 'health';

export interface Prefs {
  jobWish: Job | 'city' | null; // 15歳で決めた働き方
  marryWish: 'arranged' | 'love' | 'no' | null;
  childrenWish: number;
  keepWorking: boolean | null;
  moveToCity: boolean | null;
  invest: 'save' | 'stock' | 'spend' | null;
  retireAt: number;
  pensionTiming: 'early' | 'normal' | 'late';
  smoke: boolean;
  [k: string]: unknown;
}

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  shared: Shared;
  surname: string;
  persons: Person[];
  age: number; // 次に進める年齢
  done: string[]; // 済んだ決断の id
  focus: Focus;
  prefs: Prefs;
  finished: boolean;
  gacha: GachaInfo;
}

export interface GachaInfo {
  prefProb: number; // 真ん中の人の生まれた県を引く確率
  prefProbs?: number[]; // 3人それぞれの生まれた県を引く確率
  sexProb: number;
  middleYearProb: number;
  years: number[];
  birthsInYear: number[];
  /** この3人の組み合わせ（3つの生まれ年・3つの県・性別）を引く確率 */
  comboProb?: number;
}

/** いちばん古い生まれ年 */
export const OLDEST = 1800;

const TALENTS = ['絵', '音楽', '運動', '計算', '話すこと', '手先の器用さ', '文章', '人の世話'];

export function eraOf(index: number): EraId {
  return index as EraId;
}

/** ガチャ：新しい3人を作る */
export function createGame(opts: { seed?: number; playerBirthYear?: number | null } = {}): GameState {
  const seed = opts.seed ?? randomSeed();
  const rng = new Rng(seed);

  // 生まれ年：いちばん若い人を1990〜2010年から出生数で重み付けして引く。
  // いちばん年上の人は1800年からいちばん若い人の60年前までのどこか、真ん中の人はそのあいだのどこかに置く。
  // 3人のあいだは、どこも30年以上あける（近い年どうしだと違いが出ないため）。それ以外は決めない（何が来るか分からないように。2026-10-15）。
  // 古い年ほど少しだけ出にくくする（江戸が半分近くを占めないように。いちばん若い人の60年前を1、1800年を0.5とする重み）。
  // 1930年より前は資料と推計の統計（data/stats/prewar_*.json）、1890年より前は江戸・明治前半の推計（data/stats/edo.json）を使う
  const youngYears = Array.from({ length: 21 }, (_, i) => 1990 + i);
  const youngW = youngYears.map((y) => S.nationalBirths(Math.min(y, 2005)));
  const young = rng.weighted(youngYears, youngW);
  const oldYears = Array.from({ length: young - 60 - OLDEST + 1 }, (_, i) => OLDEST + i);
  const oldW = oldYears.map((y) => 0.5 + (0.5 * (y - OLDEST)) / Math.max(1, young - 60 - OLDEST));
  const old = rng.weighted(oldYears, oldW);
  const middle = rng.int(old + 30, young - 30);
  const years = [old, middle, young];
  const mid = years[1];
  // 真ん中の年の確率（ガチャの表示用）：いちばん若い年を引く確率と、遡る年数の組み合わせの数から
  const middleYearProb = (S.nationalBirths(Math.min(young, 2005)) / youngW.reduce((a, b) => a + b, 0)) * (1 / 21);

  // 県：3人それぞれ、その人の生まれ年の都道府県別出生数で重み付けして別々に引く（2026-10-15。以前は3人で共通）
  const prefPicks = years.map((y) => {
    const pb = S.prefBirths(y);
    const idx = rng.weighted(
      pb.map((_, i) => i),
      pb,
    );
    return { pref: idx + 1, prob: pb[idx] / pb.reduce((a, b) => a + b, 0) };
  });
  const prefs = prefPicks.map((x) => x.pref);
  const pref = prefs[1];
  const prefProb = prefPicks[1].prob;

  // 性別：出生性比
  const ratio = S.sexRatio(mid);
  const pMale = ratio / (100 + ratio);
  const sex: Sex = rng.chance(pMale) ? 'male' : 'female';

  // 家の暮らし向き：5分位なので等確率
  const familyClass = rng.int(1, 5);
  const talent = rng.pick(TALENTS);
  // 名字は3人で同じ（沖縄に生まれた人だけは、沖縄に多い名字）
  const surname = pickSurname(rng, 13);
  const surnameOkinawa = pickSurname(rng, 47);

  const shared: Shared = {
    seed,
    pref,
    sex,
    familyClass,
    talent,
    temperament: null,
    firstName: '',
    playerBirthYear: opts.playerBirthYear ?? null,
  };

  const persons = years.map((y, i) => makePerson(rng, i as EraId, y, shared, prefs[i] === 47 ? surnameOkinawa : surname, prefs[i]));
  const given = persons.map((q) => q.name.split(' ')[1]);
  persons.forEach((q) => (q.reservedNames = given));

  const state: GameState = {
    version: 1,
    seed,
    rngState: rng.state,
    shared,
    surname,
    persons,
    age: 0,
    done: [],
    focus: 'play',
    prefs: {
      jobWish: null,
      marryWish: null,
      childrenWish: 2,
      keepWorking: null,
      moveToCity: null,
      invest: null,
      retireAt: 60,
      pensionTiming: 'normal',
      smoke: false,
    },
    finished: false,
    gacha: {
      prefProb,
      prefProbs: prefPicks.map((x) => x.prob),
      sexProb: sex === 'male' ? pMale : 1 - pMale,
      middleYearProb,
      years,
      birthsInYear: years.map((y) => Math.round(S.nationalBirths(y))),
      // 生まれ年3つ × 県3つ × 性別。共有の文章で「約○億分の1」と出す
      comboProb:
        (youngW[youngYears.indexOf(young)] / youngW.reduce((a, b) => a + b, 0)) *
        (oldW[oldYears.indexOf(old)] / oldW.reduce((a, b) => a + b, 0)) *
        (1 / (young - 30 - (old + 30) + 1)) *
        prefPicks.reduce((a, x) => a * x.prob, 1) *
        (sex === 'male' ? pMale : 1 - pMale),
    },
  };
  return state;
}

/** 親の職業：同じ「家の格」を、その時代の就業構造で読み替える */
function parentJobFor(rng: Rng, year: number, familyClass: number): Job {
  const k0 = (familyClass - 3) * 0.25;
  if (isEdo(year)) {
    // 江戸：百姓・武士・町人（商い・職人）・奉公人の家。武士は人口の数%（data/stats/edo.json）。豊かな家ほど武士や大きな商家になりやすい（目安）
    const farm = S.primaryShare(year) / 100;
    const samurai = S.samuraiShare(year) / 100;
    const emp = S.employeeShare(year) / 100;
    const town = Math.max(0.03, 1 - farm - samurai - emp);
    const jobs: Job[] = ['farm', 'public', 'self', 'smallco', 'bigco'];
    const w = [farm * (1 - k0 * 0.5), samurai * (1 + k0 * 2), town * (1 + k0 * 0.6), emp * 0.9 * (1 - k0 * 0.8), emp * 0.1 * (1 + k0 * 1.5)];
    return rng.weighted(jobs, w);
  }
  const farm = S.primaryShare(year) / 100;
  const emp = S.employeeShare(year) / 100;
  const self = Math.max(0.05, 1 - farm - emp);
  const large = (S.largeShare(year) / 100) * emp;
  const pub = (S.publicShare(year) / 100) * emp;
  const small = Math.max(0.01, emp - large - pub);
  // 暮らし向きが豊かなほど、大企業・公務員・自営（商店主）になりやすい
  const k = (familyClass - 3) * 0.25;
  const jobs: Job[] = ['farm', 'self', 'smallco', 'bigco', 'public'];
  const w = [farm * (1 - k * 0.6), self * (1 + k * 0.4), small * (1 - k * 0.5), large * (1 + k * 1.2), pub * (1 + k * 0.8)];
  return rng.weighted(jobs, w);
}

/** 生まれ順：その時代の子どもの数の目安から（docs/03 C-1 完結出生子ども数：1940年4.27、1972年2.20、2025年1.86） */
function siblingsFor(rng: Rng, year: number): { order: number; total: number } {
  const mean = year < 1950 ? 4.3 : year < 1960 ? 3.0 : year < 1975 ? 2.2 : 2.0;
  let total = 1;
  // ポアソンに近い形で、1人以上
  const lam = mean - 1;
  let p = Math.exp(-lam);
  let u = rng.next();
  let k = 0;
  while (u > p && k < 10) {
    u -= p;
    k++;
    p = (p * lam) / k;
  }
  total = 1 + k;
  return { order: rng.int(1, total), total };
}

function makePerson(rng: Rng, era: EraId, birthYear: number, shared: Shared, surname: string, pref: number): Person {
  const birthMonth = rng.int(1, 12);
  const parentJob = parentJobFor(rng, birthYear, shared.familyClass);
  const sib = siblingsFor(rng, birthYear);
  const motherAge = Math.round(rng.normal(birthYear < 1950 ? 28 : birthYear < 1980 ? 26.5 : 30, 4));
  const fatherAge = motherAge + Math.max(0, Math.round(rng.normal(3, 2)));
  const given = pickGivenName(rng, birthYear, shared.sex);
  const p: Person = {
    era,
    birthYear,
    birthMonth,
    name: `${surname} ${given}`,
    sex: shared.sex,
    pref,
    familyClass: shared.familyClass,
    parentJob,
    birthOrder: sib.order,
    siblings: sib.total,
    fatherBirthYear: birthYear - Math.max(18, fatherAge),
    motherBirthYear: birthYear - Math.max(16, motherAge),
    fatherAlive: true,
    motherAlive: true,
    age: 0,
    alive: true,
    stats: { health: 72, happiness: 60, knowledge: 30, relation: 50 },
    money: 0,
    income: 0,
    lifetimeEarnings: 0,
    lifetimeEarningsReal: 0,
    edu: 'none',
    inSchool: null,
    job: null,
    jobTitle: '',
    workYears: 0,
    retired: false,
    movedToCity: S.METRO.has(pref),
    married: false,
    spouseAlive: false,
    children: [],
    wantChildren: 2,
    flags: [],
    usedKeys: [],
    log: [],
    bestYear: { age: 0, year: birthYear, happiness: 0 },
    happinessByAge: [],
    wishes: [],
  };
  if (p.parentJob === 'farm' && p.birthOrder === 1 && p.sex === 'male') p.flags.push('heir');
  // 武士の家の長男は家督を継ぐ（江戸）
  if (p.parentJob === 'public' && isEdo(birthYear) && p.birthOrder === 1 && p.sex === 'male') p.flags.push('samurai_heir');
  if (p.parentJob === 'public' && isEdo(birthYear)) p.flags.push('samurai_family');
  if (p.birthOrder === 1 && p.sex === 'male') p.flags.push('eldest_son');
  if (pref === 47 && birthYear >= 1945 && birthYear <= 1972) p.flags.push('okinawa_us');
  const pj = jobLabelAt(parentJob, birthYear);
  log(p, 'birth', '誕生', `${birthYear}年${birthMonth}月、${S.placeName(pref, birthYear)}で${p.siblings}人きょうだいの${orderLabel(p.birthOrder, p.siblings)}として生まれた。家は${pj}。${birthYear < 1872 ? '年齢は、ここでは生まれた日から数える満年齢で書く（当時は数え年）。' : ''}`);
  return p;
}

function orderLabel(order: number, total: number): string {
  if (total === 1) return 'ひとりっ子';
  return ['長子', '第2子', '第3子', '第4子', '第5子', '第6子', '第7子', '第8子', '第9子', '第10子', '第11子'][order - 1] ?? `第${order}子`;
}

export const JOB_LABEL: Record<Job, string> = {
  farm: '農家',
  self: '商店・自営業',
  smallco: '中小企業の勤め人',
  bigco: '大企業の勤め人',
  public: '公務員',
  none: '無職',
};

export const EDU_LABEL: Record<Edu, string> = {
  none: '学校に通っていない',
  middle: '中学卒',
  high: '高校卒',
  junior: '短大卒',
  univ: '大学卒',
};

/** 学制（1872年）より前を、江戸の仕組み（寺子屋・奉公・家督）として扱う */
export function isEdo(year: number): boolean {
  return year < 1872;
}

/** 仕事の呼び方を、その年の言葉で（江戸は百姓・町人・奉公人・武士） */
export function jobLabelAt(job: Job, year: number): string {
  if (isEdo(year)) return { farm: '百姓', self: '町人（商い・職人）', smallco: '奉公人', bigco: '大店の奉公人', public: '武士', none: '無職' }[job];
  if (year < 1890) return { farm: '農家', self: '商い・職人', smallco: '小さな店や工場の勤め', bigco: '大きな店や会社の勤め', public: '役人・士族', none: '無職' }[job];
  return JOB_LABEL[job];
}

/**
 * 学歴の呼び方を、その人が学んだ時代の言葉で。
 * 6歳が学制（1872年）より前なら寺子屋、15歳が学制より前なら藩校・私塾、1948年より前の中等教育は旧制の学校
 */
export function eduLabelOf(p: Person): string {
  const y6 = p.birthYear + 6;
  const y15 = p.birthYear + 15;
  const y18 = p.birthYear + 18;
  if (p.edu === 'none') return y6 < 1873 ? '手習いを受けていない' : EDU_LABEL.none;
  if (p.edu === 'middle') return y6 < 1873 ? '寺子屋で読み書き' : y15 < 1948 ? '小学校まで' : EDU_LABEL.middle;
  if (p.edu === 'high') return y15 < 1873 ? '藩校・私塾で学んだ' : y15 < 1948 ? (p.sex === 'male' ? '旧制中学卒' : '高等女学校卒') : EDU_LABEL.high;
  if (p.edu === 'junior') return y18 < 1877 ? '専門の塾で学んだ' : y18 < 1950 ? '専門学校卒' : EDU_LABEL.junior;
  return y18 < 1877 ? '遊学して学問を修めた' : y18 < 1950 ? '旧制の高等教育を修了' : EDU_LABEL.univ;
}

/** 金額を書く。円がない江戸（1871年の新貨条例より前）は、いまの価値に直して書く */
export function moneyAt(yen: number, year: number): string {
  return year < 1871 ? `いまのお金で約${man(yen * S.toReal2020(year))}` : `約${man(yen)}`;
}

export function yearOf(p: Person, age = p.age): number {
  return p.birthYear + age;
}

export function log(p: Person, kind: LogKind, title: string, text: string, extra: Partial<LogEntry> = {}): LogEntry {
  const e: LogEntry = { age: p.age, year: yearOf(p), kind, title, text, ...extra };
  p.log.push(e);
  return e;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function applyEffects(p: Person, eff: GameEvent['effects'] | undefined): void {
  if (!eff) return;
  p.stats.health = clamp(p.stats.health + (eff.health ?? 0));
  p.stats.happiness = clamp(p.stats.happiness + (eff.happiness ?? 0));
  p.stats.knowledge = clamp(p.stats.knowledge + (eff.knowledge ?? 0));
  p.stats.relation = clamp(p.stats.relation + (eff.relation ?? 0));
  if (eff.money) p.money += eff.money;
  for (const f of eff.flags ?? []) if (!p.flags.includes(f)) p.flags.push(f);
  // 家族の死を、家族の状態にも反映する（戦争の出来事。data/events/war_adult.json・meiji_taisho.json）
  const fl = eff.flags ?? [];
  if (fl.includes('war_widow') && p.married) p.spouseAlive = false;
  if (fl.includes('father_war_dead')) p.fatherAlive = false;
  if (fl.includes('son_war_dead')) {
    const son = p.children.find((c) => c.alive && c.sex === 'male');
    if (son) son.alive = false;
  }
}

// ---------- 出来事 ----------

function eduRank(e: Edu): number {
  return { none: 0, middle: 1, high: 2, junior: 3, univ: 4 }[e];
}

function matches(ev: GameEvent, p: Person, year: number): boolean {
  if (year < ev.year || year > (ev.endYear ?? ev.year)) return false;
  if (p.age < ev.ageMin || p.age > ev.ageMax) return false;
  if (ev.sex && ev.sex !== 'any' && ev.sex !== p.sex) return false;
  if (ev.prefs && ev.prefs.length && !ev.prefs.includes(p.pref)) return false;
  if (ev.key && p.usedKeys.includes(ev.key)) return false;
  if (p.usedKeys.includes(ev.id)) return false;
  const c = ev.conditions;
  if (c) {
    if (c.education && !c.education.includes(p.inSchool ?? p.edu)) return false;
    if (c.job && !c.job.includes(p.job ?? 'none')) return false;
    if (c.married !== undefined && c.married !== p.married) return false;
    if (c.familyClass && !c.familyClass.includes(p.familyClass)) return false;
    if (c.flags && !c.flags.every((f) => p.flags.includes(f))) return false;
    if (c.notFlags && c.notFlags.some((f) => p.flags.includes(f))) return false;
  }
  return true;
}

let eventIndex: Map<number, GameEvent[]> | null = null;
let indexedCount = -1;
export function eventsForYear(year: number): GameEvent[] {
  if (!eventIndex || indexedCount !== allEvents().length) {
    indexedCount = allEvents().length;
    eventIndex = new Map();
    for (const ev of allEvents()) {
      const end = Math.min(ev.endYear ?? ev.year, ev.year + 80);
      for (let y = ev.year; y <= end; y++) {
        if (!eventIndex.has(y)) eventIndex.set(y, []);
        eventIndex.get(y)!.push(ev);
      }
    }
  }
  return eventIndex.get(year) ?? [];
}

export function resetEventIndex(): void {
  eventIndex = null;
}

// ---------- 死因 ----------

/**
 * 死因：年代と年齢で重みを変える。
 * 結核は1950年まで死因の1位、1951〜80年は脳血管疾患が1位、1981年からがん（悪性新生物）が1位（人口動態統計）。
 * 重みは目安。docs/03 と docs/出典一覧.md を参照。
 */
export function deathCause(rng: Rng, year: number, age: number, sex: Sex, flags: string[]): string {
  // 飢饉や疫病の年は、その分だけ死因をそれにする（倍率 m のとき、亡くなった人のうち (m-1)/m）
  const cr = S.crisisAt(year, age);
  if (cr && cr.mult > 1 && rng.chance((cr.mult - 1) / cr.mult)) return cr.cause;
  const c: [string, number][] = [];
  if (year < 1890) {
    // 江戸・明治前半の死因の目安（死因統計は1899年から。それより前は未確認の目安）
    if (age === 0) c.push(['生まれつきの病気', 3], ['はやり病', 3], ['腹の病（胃腸炎）', 3], ['お産のときの障害', 3]);
    else if (age < 15) c.push(['疱瘡（天然痘）', year < 1850 ? 4 : 1.5], ['麻疹（はしか）', 2], ['はやり病', 3], ['腹の病（胃腸炎）', 3], ['不慮の事故', 2]);
    else if (age < 50) {
      c.push(['労咳（結核）', 6], ['はやり病', 4], ['腹の病（胃腸炎）', 2], ['不慮の事故', 2], ['脚気', year >= 1860 ? 2 : 1]);
      if (sex === 'female' && age <= 42) c.push(['お産', 5]);
    } else c.push(['中風（脳卒中）', 6], ['はやり病', 3], ['労咳（結核）', 2], ['腹の病（胃腸炎）', 2], ['老衰', age >= 75 ? 6 : age >= 65 ? 2 : 0.5]);
    return rng.weighted(
      c.map((x) => x[0]),
      c.map((x) => x[1]),
    );
  }
  if (age === 0) {
    c.push(['生まれつきの病気', 3], ['肺炎', year < 1960 ? 4 : 1], ['胃腸炎', year < 1960 ? 3 : 0.2], ['お産のときの障害', 3]);
  } else if (age < 15) {
    c.push(['肺炎', year < 1960 ? 4 : 1], ['胃腸炎', year < 1955 ? 3 : 0.2], ['不慮の事故', 4], ['がん', 1], ['生まれつきの病気', 1]);
    if (year < 1951) c.push(['結核', 2]);
  } else if (age < 40) {
    if (year <= 1950) c.push(['結核', 10]);
    else if (year < 1965) c.push(['結核', 3]);
    c.push(['不慮の事故', year >= 1960 && year <= 1975 ? 6 : 3], ['がん', 3], ['心臓の病気', 1.5], ['脳卒中', 1]);
    c.push(['自殺', year >= 1998 && year <= 2011 ? 4 : 2.5]);
  } else if (age < 65) {
    if (year <= 1950) c.push(['結核', 6]);
    c.push(['脳卒中', year <= 1980 ? 8 : 2.5], ['がん', year <= 1980 ? 5 : 10], ['心臓の病気', 3], ['肝臓の病気', 1], ['不慮の事故', 1]);
    c.push(['自殺', year >= 1998 && year <= 2011 ? 2 : 1]);
  } else {
    c.push(['脳卒中', year <= 1980 ? 8 : 3], ['がん', year <= 1980 ? 4 : 8], ['心臓の病気', 4], ['肺炎', 3]);
    c.push(['老衰', age >= 90 ? (year >= 2010 ? 12 : 6) : age >= 80 ? 2 : 0.5]);
    if (year >= 2020 && year <= 2023) c.push(['新型コロナウイルス感染症', 0.6]);
  }
  if (flags.includes('smoker')) c.push(['肺がん', 3]);
  if (sex === 'female') {
    for (const x of c) if (x[0] === '自殺' || x[0] === '不慮の事故') x[1] *= 0.5;
  }
  return rng.weighted(
    c.map((x) => x[0]),
    c.map((x) => x[1]),
  );
}

export const HEAVY_CAUSES = new Set(['飢饉', 'コレラ', '麻疹（はしか）とコレラ', '戊辰戦争', '西南戦争', '日清戦争', '日露戦争', '自殺', '空襲', '戦死', '戦病死', '原爆', '原子爆弾', '沖縄戦', '震災', '震災関連死', '津波', '地震', '地震・津波', '災害', 'シベリア抑留', '戦争（満州）', '戦争（満州からの避難）', '勤労動員中の空襲', '疎開船の沈没', '火砕流', '水害', '土砂災害', '台風', '台風・高潮', '水害・土砂災害', '地震・震災関連死']);

// ---------- 1年を進める ----------

export interface YearEntry {
  t: number;
  personIndex: number;
  entry: LogEntry;
}

/** 死亡率にかける倍率。全体の平均がほぼ1になるようにしている */
function mortalityMultiplier(p: Person): number {
  // 健康の数値は、その年齢の平均（expectedHealth）からのずれだけを死亡率に効かせる。
  // こうしないと、年をとって健康が下がるぶん死亡率を二重に数えてしまう（生命表にはもう入っている）
  const dev = (expectedHealth(p.age) - p.stats.health) / 35;
  let m = Math.min(2.2, Math.max(0.6, Math.exp(dev)));
  m *= [1.18, 1.06, 0.99, 0.93, 0.84][p.familyClass - 1];
  // 喫煙：生命表には喫煙者も含まれているので、吸う人を上げ、吸わない人を少し下げる（目安）
  if (p.age >= 35) m *= p.flags.includes('smoker') ? 1.25 : 0.85;
  return m;
}

/** 健康の数値の、年齢ごとの平均の目安（growth の下がり方に合わせる） */
export function expectedHealth(age: number): number {
  if (age <= 45) return 72;
  const n = age - 45;
  return Math.max(5, 72 - (0.03 * n * (n + 1)) / 2 - 0.4 * n);
}

export function runYear(state: GameState): YearEntry[] {
  const rng = new Rng(state.rngState);
  const out: YearEntry[] = [];
  state.persons.forEach((p, i) => {
    if (!p.alive) return;
    const before = p.log.length;
    p.age = state.age;
    const year = yearOf(p);
    p.flags = p.flags.filter((f) => f !== 'gave_birth' && f !== 'married_this_year');
    const was = { retired: p.retired, moved: p.movedToCity };
    lifecycle(state, p, rng, year);
    if (p.movedToCity && !S.METRO.has(p.pref) && !p.flags.includes('moved_to_city')) p.flags.push('moved_to_city');
    pickEvents(p, rng, year);
    growth(state, p, rng);
    // 日々のことと心の声（docs/07）
    if (p.alive) {
      const thisYear = p.log.filter((e) => e.age === p.age);
      dailyLife(p, rng, {
        year,
        triggers: triggersOf(p, thisYear, was),
        log: (kind, title, text, extra) => log(p, kind, title, text, extra),
        applyEffects: (eff) => applyEffects(p, eff),
      });
    }
    // 死亡判定
    const q = Math.min(1, S.qx(year, p.age, p.sex) * mortalityMultiplier(p));
    const extra = p.log.slice(before).find((e) => e.kind === 'death');
    if (!extra && rng.chance(q)) {
      die(p, rng, deathCause(rng, year, p.age, p.sex, p.flags));
    }
    // 年の中での時刻を割り振る
    const entries = p.log.slice(before);
    const ts = entries.map(() => 0.08 + rng.next() * 0.84).sort((a, b) => a - b);
    entries.forEach((e, k) => {
      if (e.kind === 'death') ts[k] = Math.max(ts[k], ts[entries.length - 1] ?? 0.9);
      out.push({ t: e.kind === 'birth' ? 0.02 : ts[k], personIndex: i, entry: e });
    });
    p.happinessByAge[p.age] = p.stats.happiness;
    if (p.alive && p.stats.happiness > p.bestYear.happiness) p.bestYear = { age: p.age, year, happiness: p.stats.happiness };
  });
  state.rngState = rng.state;
  state.age += 1;
  if (state.persons.every((p) => !p.alive)) state.finished = true;
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function die(p: Person, rng: Rng, cause: string): void {
  p.alive = false;
  p.deathAge = p.age;
  p.deathYear = yearOf(p);
  p.deathCause = cause;
  const heavy = HEAVY_CAUSES.has(cause);
  const text =
    p.age === 0
      ? `${p.deathYear}年、生まれて1年を迎えずに亡くなった。死因は${cause}。この年に生まれた子のうち、およそ${Math.round(1 / Math.max(0.0005, S.qx(p.deathYear, 0, p.sex)))}人に1人が1歳を迎えられなかった。`
      : `${p.deathYear}年、${p.age}歳で亡くなった。死因は${cause}。`;
  log(p, 'death', `${p.age}歳で死去`, text, { heavy });
}

function pickEvents(p: Person, rng: Rng, year: number): void {
  const pool = eventsForYear(year).filter((ev) => matches(ev, p, year));
  // 重い出来事と全国の大きな出来事を先に
  const order = (ev: GameEvent) => (ev.heavy ? 0 : ev.category === 'war' || ev.category === 'pref' ? 1 : ev.category === 'national' || ev.category === 'system' ? 2 : 3);
  pool.sort((a, b) => order(a) - order(b) || rng.next() - 0.5);
  let n = 0;
  for (const ev of pool) {
    if (n >= 3) break;
    if (!p.alive) break;
    if (!rng.chance(Math.max(0, Math.min(1, ev.probability)))) continue;
    n++;
    p.usedKeys.push(ev.key ?? ev.id);
    log(p, 'event', ev.title, ev.text, {
      heavy: ev.heavy,
      category: ev.category,
      source: ev.source?.title ? `${ev.source.title}${ev.source.verified === false ? '（未確認）' : ''}` : undefined,
    });
    applyEffects(p, ev.effects);
    const d = ev.effects?.death;
    if (d && rng.chance(d.prob)) die(p, rng, d.cause);
  }
}

/** 状態の自然な変化（年齢、今年の重点） */
function growth(state: GameState, p: Person, rng: Rng): void {
  const s = p.stats;
  const f = state.focus;
  const a = p.age;
  if (a >= 3 && a < 23) s.knowledge = clamp(s.knowledge + (f === 'study' ? 4 : 1.5) + (p.inSchool ? 1 : 0));
  if (f === 'friends' || f === 'family') s.relation = clamp(s.relation + 3);
  if (f === 'sports' || f === 'health') s.health = clamp(s.health + 2.5);
  if (f === 'play') s.happiness = clamp(s.happiness + 3);
  if (f === 'help' || f === 'work') {
    s.relation = clamp(s.relation + 1);
    p.money += p.income * 0.02;
  }
  // 年をとると健康は下がる
  if (a > 45) s.health = clamp(s.health - (a - 45) * 0.03 - rng.next() * 0.8);
  // 健康は、その年齢の平均へ少しずつ戻る（病気やけがの影響は生命表にすでに含まれているため、二重に数えない）
  s.health = clamp(s.health + (expectedHealth(a) - s.health) * 0.08);
  // 幸福はゆっくり60に戻る
  s.happiness = clamp(s.happiness + (60 - s.happiness) * 0.12 + rng.normal(0, 2));
  s.relation = clamp(s.relation + (50 - s.relation) * 0.05);
}

// ---------- 人生の節目（学校・仕事・家族・お金・年金） ----------

function lifecycle(state: GameState, p: Person, rng: Rng, year: number): void {
  const a = p.age;
  const prefName = S.PREFS[p.pref - 1];

  // 親の死
  for (const who of ['father', 'mother'] as const) {
    const alive = who === 'father' ? p.fatherAlive : p.motherAlive;
    if (!alive) continue;
    const by = who === 'father' ? p.fatherBirthYear : p.motherBirthYear;
    const pa = year - by;
    if (pa < 20) continue;
    if (rng.chance(S.qx(year, pa, who === 'father' ? 'male' : 'female'))) {
      if (who === 'father') p.fatherAlive = false;
      else p.motherAlive = false;
      const label = who === 'father' ? '父' : '母';
      log(p, 'family', `${label}が亡くなった`, `${label}が${pa}歳で亡くなった。自分は${a}歳だった。`);
      applyEffects(p, { happiness: a < 20 ? -20 : -12, relation: -3 });
      if (a < 18) p.flags.push('lost_parent_young');
    }
  }

  // 卒業して働き始める
  if (p.inSchool === 'univ' && a === 22) {
    p.edu = 'univ';
    findJob(state, p, rng, year, 'univ');
  }
  if (p.inSchool === 'junior' && a === 20) {
    p.edu = 'junior';
    findJob(state, p, rng, year, 'junior');
  }

  // 学校
  if (a === 6 && year < 1873) {
    // 学制（1872年公布、翌年から小学校）より前：寺子屋などで手習い（読み書き・そろばん）を受けたかどうか。割合は推計（data/stats/edo.json）
    const enroll = S.elementaryEnrollment(year, p.sex) / 100;
    const samurai = p.flags.includes('samurai_family');
    if (!samurai && !rng.chance(Math.min(0.97, enroll * [0.6, 0.8, 1, 1.2, 1.45][p.familyClass - 1]))) {
      p.flags.push('no_school');
      p.wishes.push({ age: a, wish: '手習いに通うこと', result: '家の手伝いと子守りで通えなかった', ok: false });
      log(p, 'wish', '手習いに通えなかった', `${year}年。近くの子が寺子屋に通い始めたが、自分は家の手伝いと子守りで通えなかった。この時代に手習いを受けた${p.sex === 'male' ? '男' : '女'}の子は、約${Math.round(enroll * 100)}%とされる（推計）。`);
    } else {
      p.inSchool = 'none';
      log(
        p,
        'school',
        samurai ? '手習いを始めた' : '寺子屋に入った',
        samurai
          ? `${year}年、${p.sex === 'male' ? '素読（漢文を声に出して読むこと）と手習いを始めた。武士の子は、のちに藩校で学ぶ' : '手習いと裁縫を習い始めた'}。`
          : `${year}年、寺子屋に入り、師匠のもとで手習い（読み書き）とそろばんを習い始めた。寺子屋に決まった入学の年はなかった。`,
      );
    }
  } else if (a === 6) {
    const school = year >= 1941 && year <= 1946 ? '国民学校' : year < 1886 ? '小学校' : year < 1941 ? '尋常小学校' : '小学校';
    // 明治の終わりまでは、学校に通えない子どもも多かった（就学率。data/stats/prewar_social.json）
    const enroll = S.elementaryEnrollment(year, p.sex) / 100;
    if (year < 1930 && !rng.chance(enroll)) {
      p.flags.push('no_school');
      p.wishes.push({ age: a, wish: '小学校に通うこと', result: '家の手伝いと子守りで通えなかった', ok: false });
      log(p, 'wish', '学校に通えなかった', `${year}年、${school}に上がる年になったが、家の手伝いと子守りで通えなかった。この年の${p.sex === 'male' ? '男' : '女'}の子の就学率は約${Math.round(enroll * 100)}%だった。`);
    } else {
      p.inSchool = 'none';
      log(p, 'school', `${school}に入学`, `${prefName}の${school}に入学した。${year >= 1941 && year <= 1946 ? '1941年から1947年まで、小学校は国民学校と呼ばれていた。' : year < 1886 ? '学制で始まった小学校で、授業料がかかった。寺子屋の建物や寺を校舎に使うところも多かった。' : year < 1941 ? '尋常小学校は6年（1907年までは4年）だった。' : ''}`);
    }
  }
  if (a === 12 && p.inSchool !== null) {
    p.edu = 'middle';
  }

  // 働いている人の1年
  if (p.job && p.job !== 'none' && !p.retired) {
    work(p, rng, year);
  }

  // 子どもが生まれる
  if (p.married && p.spouseAlive && p.children.length < p.wantChildren) {
    const fertileAge = p.sex === 'female' ? a : a - 2;
    if (fertileAge >= 18 && fertileAge <= 42) {
      const prob = fertileAge < 35 ? 0.3 : 0.12;
      if (rng.chance(prob)) {
        const csex: Sex = rng.chance(0.513) ? 'male' : 'female';
        const child = { birthYear: year, sex: csex, alive: true, name: nameChild(p, rng, year, csex) };
        p.children.push(child);
        p.flags.push('gave_birth');
        const n = p.children.length;
        log(p, 'family', `${n === 1 ? '第1子' : `第${n}子`}が生まれた`, `${year}年、${csex === 'male' ? '男の子' : '女の子'}が生まれた。名前は${child.name}。${birthPlaceText(year)}`);
        applyEffects(p, { happiness: 12, relation: 6, money: -S.annualWage(year, 30, 'male', 'high') * 0.1 });
        if (rng.chance(S.qx(year, 0, csex))) {
          child.alive = false;
          log(p, 'family', '子どもを亡くした', `生まれた子が、1歳を迎えずに亡くなった。`, { heavy: true });
          applyEffects(p, { happiness: -25 });
        }
        // 女性が出産で仕事を辞める
        if (p.sex === 'female' && p.job && p.job !== 'none' && n === 1) maybeQuitForChild(state, p, rng, year);
      }
    }
  }

  // 配偶者の死
  if (p.married && p.spouseAlive && a >= 40) {
    const spSex: Sex = p.sex === 'male' ? 'female' : 'male';
    const spAge = p.sex === 'male' ? a - 3 : a + 3;
    if (rng.chance(S.qx(year, spAge, spSex))) {
      p.spouseAlive = false;
      log(p, 'family', '配偶者を亡くした', `${p.sex === 'male' ? '妻' : '夫'}が${spAge}歳で亡くなった。`);
      applyEffects(p, { happiness: -20, relation: -8, health: -4 });
    }
  }

  // 結婚
  if (!p.married && state.prefs.marryWish && state.prefs.marryWish !== 'no' && a >= 18 && a <= 49) {
    const prob = marriageHazard(p, year, state.prefs.marryWish);
    if (rng.chance(prob)) marry(state, p, rng, year);
  }

  // 病気と治療費
  illness(p, rng, year);
  // 才能が花開くか（時代しだい）
  talentBloom(state, p, rng, year);

  // 定年と年金
  pensionAndRetire(state, p, rng, year);

  // お金：利息と生活費
  const rate = depositRate(year) / 100;
  if (p.money > 0) {
    const inv = state.prefs.invest;
    if (inv === 'stock') p.money *= 1 + stockReturn(year, rng);
    else p.money *= 1 + rate;
  }
}

function birthPlaceText(year: number): string {
  // 施設（病院・診療所・助産所）で生まれた割合：1950年4.6%、1955年17.6%、1960年50.1%、1965年84.0%、1970年96.1%
  // （厚生労働省の資料、原資料は人口動態統計「出生の場所別」。docs/03 の G 章）
  if (year < 1960) return '家で、産婆さんに取り上げてもらった。';
  if (year < 1965) return '病院か助産所で生まれた。家で産むのは少なくなっていた。';
  return '病院で生まれた。';
}

/**
 * 定期預金の金利の目安（%）。1985年より前は日本銀行の時系列統計に見つからず未確認。
 * 1991年以降は日本銀行の店頭定期預金の金利（1991年10月の1年もの5.79%など。docs/03 の F-5）に大まかに合わせた
 */
export function depositRate(year: number): number {
  if (year < 1945) return 3.5;
  if (year < 1950) return 2;
  if (year < 1973) return 5.5;
  if (year < 1981) return 6.5;
  if (year < 1991) return 4.5;
  if (year < 1993) return 5;
  if (year < 1994) return 3;
  if (year < 1995) return 2;
  if (year < 2000) return 0.5;
  return 0.05;
}

/** 株の年間の値動きの目安。バブルとその崩壊、リーマン・ショックなどを大まかに（未確認） */
function stockReturn(year: number, rng: Rng): number {
  let mean = 0.05;
  if (year >= 1955 && year <= 1972) mean = 0.12;
  if (year >= 1986 && year <= 1989) mean = 0.25;
  if (year >= 1990 && year <= 1992) mean = -0.2;
  if (year >= 1993 && year <= 2002) mean = -0.04;
  if (year === 2008) mean = -0.4;
  if (year >= 2013 && year <= 2024) mean = 0.08;
  return Math.max(-0.6, rng.normal(mean, 0.18));
}

function marriageHazard(p: Person, year: number, wish: 'arranged' | 'love'): number {
  // 50歳までに結婚する割合（50歳になる年の未婚割合から）と、平均初婚年齢を中心にした分布
  const never = S.neverMarried50(Math.min(year - p.age + 50, 2020), p.sex) / 100;
  const ever = Math.min(0.98, (1 - never) * (wish === 'arranged' ? 1.04 : 1.0));
  const mean = S.meanMarriageAge(year, p.sex);
  const sd = 4;
  // 正規分布の密度を、生存者の中でのハザードに直す
  const z = (p.age - mean) / sd;
  const dens = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  const cdf = 0.5 * (1 + erf(z / Math.SQRT2));
  const remaining = Math.max(0.02, 1 - ever * cdf);
  return Math.min(0.6, (ever * dens) / remaining);
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * 見合い結婚の割合（出生動向基本調査 第17回 図表5-2 の結婚年別。docs/03 C-1）。
 * 1935年より前は調査がないので、親や仲人が相手を決める結婚が9割になるまで、古いほど増やす（目安）
 */
export function arrangedShare(year: number): number {
  if (year < 1935) return Math.min(0.9, 0.69 + (1935 - year) * 0.004);
  return (
    S.interp(
      { '1935': 69.0, '1955': 53.9, '1967': 44.9, '1975': 30.4, '1985': 17.7, '1995': 9.6, '2005': 6.4, '2015': 5.3, '2022': 8.9 },
      year,
    ) ?? 10
  ) / 100;
}

function marry(state: GameState, p: Person, rng: Rng, year: number): void {
  p.married = true;
  p.spouseAlive = true;
  p.flags.push('married_this_year');
  p.marriageAge = p.age;
  const arr = arrangedShare(year);
  const wish = state.prefs.marryWish;
  let type: Person['marriageType'];
  if (wish === 'love') {
    // 恋愛を望んでも、見合いが当たり前だった時代は見合いになりやすい
    type = rng.chance(arr * 0.6) ? '見合い' : year >= 2015 && rng.chance(0.18) ? 'ネット' : '恋愛';
  } else {
    type = rng.chance(Math.min(0.95, arr * 1.6 + 0.05)) ? '見合い' : '恋愛';
  }
  p.marriageType = type;
  const spouse = nameSpouse(p, rng);
  p.wantChildren = state.prefs.childrenWish;
  const wantedLove = wish === 'love' && type === '見合い';
  if (wantedLove) p.wishes.push({ age: p.age, wish: '恋愛結婚', result: '見合いで結婚', ok: false });
  const old = year < 1935;
  const how = type === '見合い' ? (year < 1890 ? '親の決めた相手と、仲人を立てて' : '見合いで') : type === 'ネット' ? 'ネットで知り合った相手と' : year < 1890 ? '好き合った相手と' : '恋愛で';
  const why = old ? 'この時代は、親や仲人が相手を決めるのが当たり前だった。' : 'この時代は' + Math.round(arr * 100) + '%が見合い結婚だった。';
  log(p, 'family', `${p.age}歳で結婚`, `${year}年、${how}結婚した。相手は${spouse}。${wantedLove ? 'ほんとうは好きな人と結婚したかったが、' + why : ''}`);
  applyEffects(p, { happiness: 15, relation: 10 });
  // 寿退社
  if (p.sex === 'female' && p.job && p.job !== 'none' && p.job !== 'farm' && p.job !== 'self') {
    const quitP = year < 1975 ? 0.55 : year < 1986 ? 0.45 : year < 2000 ? 0.3 : 0.12;
    if (rng.chance(quitP)) {
      const wanted = state.prefs.keepWorking === true;
      if (year < 1890) quit(p, '奉公をやめた', `結婚を機に奉公をやめ、嫁ぎ先の家の仕事を担った。${wanted ? '外で働き続けたかったが、' : ''}嫁は家の働き手でもあった。`);
      else quit(p, '寿退社', `結婚を機に会社を辞めた。${wanted ? '続けたかったが、' : ''}この時代は、結婚したら辞めるのが当たり前とされる職場が多かった。`);
      if (wanted) p.wishes.push({ age: p.age, wish: '仕事を続ける', result: '寿退社', ok: false });
    }
  }
}

function quit(p: Person, title: string, text: string): void {
  p.job = 'none';
  // 専業主婦という言葉と暮らし方は近代のもの。それより前は、嫁ぎ先の家の仕事を担った
  p.jobTitle = yearOf(p) < 1900 ? '家の仕事' : '専業主婦';
  p.income = 0;
  p.flags.push('quit_for_family');
  log(p, 'work', title, text);
}

function maybeQuitForChild(state: GameState, p: Person, rng: Rng, year: number): void {
  // 第1子を産む前に働いていた女性のうち、出産後も仕事を続けた割合。
  // 1985〜89年は約4割（就業継続24.1%÷（24.1%＋出産退職37.3%）、男女共同参画白書）。
  // 2015〜19年は69.9%、2020〜24年は80.5%（出生動向基本調査 第17回。紹介記事で確認、元の報告書は未確認）。間の年は目安
  const keep = year < 1985 ? 0.3 : year < 1995 ? 0.39 : year < 2005 ? 0.42 : year < 2015 ? 0.55 : year < 2020 ? 0.7 : 0.8;
  const wantKeep = state.prefs.keepWorking !== false;
  const pKeep = wantKeep ? Math.min(0.95, keep * 1.4) : keep * 0.3;
  if (!rng.chance(pKeep)) {
    quit(p, '出産で退職', wantKeep ? '子どもが生まれ、仕事を辞めた。続けたかったが、預け先も、休める制度も足りなかった。' : '子どもが生まれ、家庭に入った。');
    if (wantKeep) p.wishes.push({ age: p.age, wish: '出産後も仕事を続ける', result: '退職', ok: false });
  } else if (year >= 1992) {
    log(p, 'work', '育児休業をとった', '育児休業をとって、職場に戻った。育児休業法は1992年に施行された。');
  }
}

const JOB_FACTOR: Record<Job, number> = { farm: 0.55, self: 0.85, smallco: 0.85, bigco: 1.25, public: 1.05, none: 0 };

function work(p: Person, rng: Rng, year: number): void {
  const job = p.job as Job;
  const base = S.annualWage(year, p.age, p.sex, p.edu);
  let income = base * JOB_FACTOR[job] * (0.9 + rng.next() * 0.2);
  if (p.flags.includes('part_time')) income *= 0.45;
  if (p.flags.includes('talent_bloom')) income *= 1.08;
  p.income = income;
  p.workYears += 1;
  p.lifetimeEarnings += income;
  p.lifetimeEarningsReal += income * S.toReal2020(year);
  // 生活費を引いた残りを貯める。家族が多いほど貯まらない
  const saveRate = 0.12 - p.children.length * 0.02 + (year >= 1960 && year <= 1990 ? 0.05 : 0);
  p.money += income * Math.max(0.01, saveRate);
  // 失業
  const u = S.unemployment(year) / 100;
  const risk = { farm: 0.2, self: 0.6, smallco: 1.3, bigco: 0.5, public: 0.1, none: 0 }[job];
  if (p.age < 60 && year < 1890 && rng.chance(0.02 * risk)) {
    // 江戸・明治前半：失業の統計はない。奉公先が傾く、暇を出されるなどの目安
    log(p, 'work', isEdo(year) ? '暇を出された' : '職を失った', isEdo(year) ? `${year}年、奉公先の商いが傾き、暇を出された。` : `${year}年、勤め先の商いが傾き、職を失った。`);
    applyEffects(p, { happiness: -15, money: -income * 0.3 });
    if (rng.chance(0.6)) {
      p.job = 'smallco';
      p.jobTitle = jobLabelAt('smallco', year);
      log(p, 'work', '次の勤め先', isEdo(year) ? '口入れ屋（仕事の世話をする店）の世話で、別の奉公先が見つかった。' : '知り合いの口ききで、別の店で働くことになった。');
    } else {
      p.flags.push('part_time');
      p.job = 'smallco';
      p.jobTitle = '日雇いの仕事';
      log(p, 'work', '日雇いで働く', '決まった勤め先は見つからず、日雇いの仕事でしのいだ。');
    }
  } else if (p.age < 60 && year >= 1890 && rng.chance(u * risk * 0.6)) {
    log(p, 'work', '職を失った', `${year}年、勤め先が人を減らし、職を失った。この年の完全失業率は${u * 100 >= 0.1 ? (u * 100).toFixed(1) : '−'}%${year >= 1963 ? `、有効求人倍率は${S.jobOpenings(year).toFixed(2)}倍` : ''}だった。`);
    applyEffects(p, { happiness: -15, money: -income * 0.3 });
    const reemp = Math.min(0.9, 0.4 + S.jobOpenings(year) * 0.3);
    if (rng.chance(reemp)) {
      p.job = 'smallco';
      p.jobTitle = '中小企業の勤め人';
      log(p, 'work', '再就職した', `しばらくして、小さな会社に再就職できた。`);
    } else {
      p.flags.push('part_time');
      p.job = 'smallco';
      p.jobTitle = '非正規の仕事';
      log(p, 'work', '非正規で働く', '正社員の仕事は見つからず、パートや派遣の仕事でしのいだ。');
    }
  }
}

function pensionAndRetire(state: GameState, p: Person, rng: Rng, year: number): void {
  const a = p.age;
  // 定年の目安：一律定年制の企業のうち60歳以上の定年は1984年に半数を超えた（衆議院答弁書・JILPT。docs/03 の G 章）。
  // それより前は55歳が多く、その後60歳へ移った（ここでは1980〜97年を58歳とした）。
  // 1998年から60歳未満の定年は禁止。2013年からは65歳までの雇用確保が実質的に義務になったので65歳とした
  const teinen = year < 1980 ? 55 : year < 1998 ? 58 : year < 2013 ? 60 : 65;
  const employee = p.job === 'bigco' || p.job === 'smallco' || p.job === 'public';
  // 定年の仕組みが広まる前（1920年より前）は、家督や店を譲って隠居する（目安：60歳前後。続けたい人は65歳ごろ）
  if (year < 1920 && p.job && p.job !== 'none' && !p.retired) {
    if (a >= (state.prefs.retireAt >= 65 ? 66 : 60)) {
      p.retired = true;
      p.income = 0;
      const t =
        p.job === 'public'
          ? '家督を跡継ぎに譲り、隠居した。'
          : p.job === 'farm' || p.job === 'self'
            ? `${p.children.some((c) => c.alive) ? '家督と仕事を子に譲り' : '仕事を退き'}、隠居した。`
            : isEdo(year)
              ? '長く勤めた奉公先を退き、隠居した。'
              : '長く勤めた勤め先を退き、隠居した。';
      log(p, 'work', `${a}歳で隠居`, `${year}年、${a}歳で${t}`);
    }
    return;
  }
  if (employee && !p.retired && a >= Math.max(teinen, Math.min(state.prefs.retireAt, 75)) && a >= teinen) {
    p.retired = true;
    const wage = S.annualWage(year, 55, p.sex, p.edu);
    const lump = wage * (p.job === 'bigco' ? 2.2 : p.job === 'public' ? 2.0 : 1.0) * (p.workYears / 35);
    p.money += lump;
    p.income = 0;
    log(p, 'work', `${a}歳で定年退職`, `${year}年、${a}歳で定年を迎えた。この時代の定年は${teinen}歳が一般的だった。退職金は約${man(lump)}だった。`);
  }
  if ((p.job === 'farm' || p.job === 'self') && !p.retired && a >= 72) {
    p.retired = true;
    p.income = 0;
    log(p, 'work', '仕事から退いた', `${a}歳で、仕事を次の世代に譲った。`);
  }

  // 1911年4月1日以前の生まれは、国民年金（1961年）の保険料を納める期間がほとんどなく、拠出の年金は受けられなかった。
  // 70歳から、税でまかなう老齢福祉年金（1961年の開始時は月1,000円。目安：のちの賃金の伸びに合わせて増やす）を受けた（未確認を含む目安）
  const fyBirth = p.birthMonth >= 4 ? p.birthYear : p.birthYear - 1;
  if (fyBirth < 1911 && p.pensionStartAge === undefined) {
    if (year >= 1961 && a >= 70) {
      p.pensionStartAge = a;
      const monthly = 1000 * Math.max(1, S.incomeIndex(year) / S.incomeIndex(1961)) * 0.6;
      p.pensionMonthly = Math.round(monthly);
      p.pensionMonthlyReal = Math.round(monthly * S.toReal2020(year));
      log(p, 'pension', `${a}歳で老齢福祉年金`, `${year}年、老齢福祉年金を受け取り始めた。月に約${man(monthly)}。1911年4月1日より前に生まれた人は、国民年金の保険料を納める期間がなく、税でまかなうこの少額の年金だけだった。`);
    }
  }

  // 年金の受給開始
  if (p.pensionStartAge === undefined && fyBirth >= 1911) {
    let start = S.pensionStartAge(p.birthYear, p.birthMonth, p.sex);
    const contributor = p.workYears >= 10 || p.married;
    if (!contributor) start = 65;
    if (state.prefs.pensionTiming === 'early') start = Math.max(60, start - 3);
    if (state.prefs.pensionTiming === 'late') start = Math.min(75, start + 5);
    // 働きながらでも、支給開始年齢になったら受け取り始める（在職老齢年金による減額は扱わない）
    if (a >= start) {
      startPension(state, p, year, start);
    }
  }
  if (p.pensionStartAge !== undefined && p.pensionMonthly) {
    p.money += p.pensionMonthly * 12 * (S.incomeIndex(year) / S.incomeIndex(year - (a - p.pensionStartAge))) ** 0.5;
    // 生活費
    p.money -= p.pensionMonthly * 12 * 0.9;
  }
}

function startPension(state: GameState, p: Person, year: number, start: number): void {
  p.pensionStartAge = p.age;
  // 2024年度の水準で計算し、その年の賃金水準に直す
  // 基礎年金の満額は2024年度で月68,000円。厚生年金の報酬比例部分は 平均標準報酬額 × 5.481/1000 × 加入月数
  const years = Math.min(40, p.workYears);
  const idx2024 = S.incomeIndex(2024);
  const avgReal2024 = p.workYears > 0 ? (p.lifetimeEarnings / p.workYears) : 0;
  // 名目の平均を、加入期間の真ん中の年の賃金水準から2024年水準へ直す（再評価の近似）
  const midYear = p.birthYear + 20 + Math.floor(p.workYears / 2);
  const revalued = avgReal2024 * (idx2024 / Math.max(0.01, S.incomeIndex(midYear)));
  const kiso = 68000 * Math.min(1, (p.married ? 40 : Math.max(years, 25)) / 40);
  const employee = p.flags.includes('employee_history');
  const hirei = employee ? ((revalued / 12) * 5.481) / 1000 * years * 12 / 12 : 0;
  // 生まれ年による違い（古い世代ほど給付の乗率が高かった。目安）
  const cohort = p.birthYear < 1946 ? 1.15 : p.birthYear < 1960 ? 1.05 : 1.0;
  let monthly2024 = (kiso + hirei) * cohort;
  let range: [number, number] | undefined;
  if (year > 2024) {
    // 2024年財政検証：所得代替率は 61.2% から、成長型経済移行・継続ケースで57.6%、過去30年投影ケースで50.4%へ
    const opt = monthly2024 * (57.6 / 61.2);
    const pes = monthly2024 * (50.4 / 61.2);
    range = [pes, opt];
    monthly2024 = (opt + pes) / 2;
  }
  // 繰上げ・繰下げ
  const timing = state.prefs.pensionTiming;
  const adj = timing === 'early' ? 0.76 : timing === 'late' ? 1.42 : 1;
  monthly2024 *= adj;
  const nominal = monthly2024 * (S.incomeIndex(year) / idx2024);
  p.pensionMonthly = nominal;
  p.pensionMonthlyReal = nominal * S.toReal2020(year);
  if (range) p.pensionRange = [range[0] * adj * (S.incomeIndex(year) / idx2024) * S.toReal2020(year), range[1] * adj * (S.incomeIndex(year) / idx2024) * S.toReal2020(year)];
  log(
    p,
    'pension',
    `${p.age}歳で年金の受給開始`,
    `${year}年、年金を受け取り始めた。月に約${man(nominal)}${year !== 2020 ? `（今の価値で約${man(p.pensionMonthlyReal)}）` : ''}。${p.age < 65 && year >= 1986 ? '65歳までは厚生年金の部分だけで、基礎年金が加わるのは65歳から（ここでは65歳以降の月額を示す）。' : ''}${range ? '2024年の財政検証の見通しから計算した推計で、幅がある。' : ''}`,
  );
}

export function man(yen: number): string {
  if (!Number.isFinite(yen)) return '−';
  const abs = Math.abs(yen);
  if (abs >= 1e8) return `${(yen / 1e8).toFixed(abs >= 1e9 ? 0 : 1)}億円`;
  if (abs >= 1e4) return `${Math.round(yen / 1e4).toLocaleString('ja-JP')}万円`;
  return `${Math.round(yen).toLocaleString('ja-JP')}円`;
}

export function startWork(p: Person, job: Job, headline: string, year: number, text: string): void {
  p.job = job;
  p.jobTitle = job === 'smallco' && p.flags.includes('part_time') ? (year < 1890 ? '日雇いの仕事' : '非正規の仕事') : jobLabelAt(job, year);
  p.inSchool = null;
  p.retired = false;
  if (job === 'bigco' || job === 'smallco' || job === 'public') p.flags.push('employee_history');
  log(p, 'work', headline, text);
}

export function aliveCount(state: GameState): number {
  return state.persons.filter((p) => p.alive).length;
}

/** 最後の画面用：同じ年に生まれた人のうち、何%より長生きしたか */
export function survivalPercentile(p: Person): number {
  if (p.deathAge === undefined) return 0;
  let alive = 1;
  for (let a = 0; a < p.deathAge; a++) alive *= 1 - S.qx(p.birthYear + a, a, p.sex);
  return Math.round((1 - alive) * 100);
}

/** 生存曲線（同じ年に生まれた人のうち、その年齢で生きている割合） */
export function survivalCurve(birthYear: number, sex: Sex, maxAge = 105): number[] {
  const out: number[] = [];
  let alive = 1;
  for (let a = 0; a <= maxAge; a++) {
    out.push(alive);
    alive *= 1 - S.qx(birthYear + a, a, sex);
  }
  return out;
}

/** その生まれ年の平均寿命（コーホート、生命表どおりに生きた場合） */
export function cohortLifeExpectancy(birthYear: number, sex: Sex): number {
  const c = survivalCurve(birthYear, sex, 105);
  return c.reduce((s, x, i) => s + (i === 0 ? 0 : x), 0) + 0.5;
}

// ---------- 就職 ----------

const BASE_BIGCO: Record<'middle' | 'high' | 'junior' | 'univ', number> = { middle: 0.1, high: 0.22, junior: 0.25, univ: 0.45 };

/** 学校を出て働き始める。望んだ働き方（15歳で決めたもの）を、その年の求人の多さで叶える */
export function findJob(state: GameState, p: Person, rng: Rng, year: number, level: 'middle' | 'high' | 'junior' | 'univ'): void {
  p.inSchool = null;
  if (year < 1890) return findJobOld(state, p, rng, year, level);
  const wish = state.prefs.jobWish;
  const jo = S.jobOpenings(year);
  const ng = S.newGradRatio(level === 'junior' ? 'univ' : level, year);
  const market = ng ?? jo * (level === 'univ' ? 1.4 : level === 'middle' ? 2.2 : 1.8);
  const mkt = Math.max(0.3, Math.min(1.7, market / 1.5));
  const fam = [0.75, 0.9, 1, 1.1, 1.25][p.familyClass - 1];
  const prefName = S.PREFS[p.pref - 1];
  const marketText = ng !== undefined ? `この年の${level === 'univ' || level === 'junior' ? '大卒' : level === 'high' ? '高卒' : '中卒'}の求人倍率は${ng.toFixed(2)}倍。` : year >= 1963 ? `この年の有効求人倍率は${jo.toFixed(2)}倍。` : '';

  // 農家の長男は家を継ぐ（1960年代前半までは、ほぼ選べなかった）
  if (p.flags.includes('heir') && year < 1965 && wish !== 'farm') {
    if (rng.chance(year < 1955 ? 0.85 : 0.6)) {
      startWork(p, 'farm', '家の農業を継いだ', year, `長男なので、家の田畑を継ぐことになった。${wish ? 'ほかの道も考えていたが、選べなかった。' : ''}`);
      if (wish) p.wishes.push({ age: p.age, wish: jobWishLabel(wish), result: '家業の農業を継いだ', ok: false });
      return;
    }
  }

  // 集団就職：地方の中卒が都会の工場や商店へ（1950年代半ば〜1970年代前半）
  if (level === 'middle' && !S.METRO.has(p.pref) && year >= 1954 && year <= 1975 && rng.chance(wish === 'city' ? 0.7 : 0.35)) {
    p.movedToCity = true;
    p.flags.push('group_employment');
    startWork(p, 'smallco', '集団就職', year, `中学を出てすぐ、集団就職の列車で${prefName}を離れ、都会の工場に入った。${marketText}中卒は「金の卵」と呼ばれた。`);
    return;
  }

  let job: Job = 'smallco';
  let title = '地元の会社に就職';
  let ok = true;
  if (wish === 'bigco') {
    if (rng.chance(Math.min(0.9, BASE_BIGCO[level] * 1.6 * mkt * fam))) {
      job = 'bigco';
      title = '大企業に就職';
    } else ok = false;
  } else if (wish === 'public') {
    if (rng.chance(Math.min(0.8, (level === 'univ' ? 0.35 : 0.25) * fam * (1.2 - mkt * 0.2)))) {
      job = 'public';
      title = '公務員になった';
    } else ok = false;
  } else if (wish === 'farm') {
    if (p.parentJob === 'farm') {
      job = 'farm';
      title = '家の農業を継いだ';
    } else ok = false;
  } else if (wish === 'self') {
    if (p.parentJob === 'self' || rng.chance(0.15 * fam)) {
      job = 'self';
      title = p.parentJob === 'self' ? '家の商売を継いだ' : '自分の店を持った';
    } else ok = false;
  } else if (wish === 'city') {
    if (!S.METRO.has(p.pref)) {
      p.movedToCity = true;
      title = '上京して就職';
    }
    if (rng.chance(BASE_BIGCO[level] * mkt * fam)) job = 'bigco';
  } else {
    if (rng.chance(BASE_BIGCO[level] * mkt * fam)) {
      job = 'bigco';
      title = '大企業に就職';
    } else if (p.parentJob === 'farm' && rng.chance(Math.max(0.05, S.primaryShare(year) / 100))) {
      job = 'farm';
      title = '家の農業を継いだ';
    }
  }
  // 就職氷河期：正社員になれない
  let partTime = false;
  if (job !== 'farm' && job !== 'self' && market < 1.1 && year >= 1993 && rng.chance(Math.min(0.5, (1.2 - market) * 0.5 + 0.1))) {
    partTime = true;
    p.flags.push('part_time');
    job = 'smallco';
    title = '非正規で働き始めた';
  }
  const wishTxt = wish ? jobWishLabel(wish) : '';
  let text = `${year}年、${title.replace('に就職', 'に入った')}。${marketText}`;
  if (!ok && wish) {
    text = `${jobWishLabel(wish)}を目指したが、叶わなかった。${year}年、${job === 'bigco' ? '大企業' : '地元の会社'}に入った。${marketText}`;
    p.wishes.push({ age: p.age, wish: wishTxt, result: title, ok: false });
  }
  if (partTime) text = `${year}年、正社員の仕事が見つからず、契約社員として働き始めた。${marketText}就職氷河期と呼ばれた。`;
  startWork(p, job, title, year, text);
  if (ok && wish) p.wishes.push({ age: p.age, wish: wishTxt, result: title, ok: true });
}

/**
 * 江戸・明治前半の働き始め。夢（14歳で決めた働き方）を、その時代の言葉に読み替える：
 * 大きな会社＝大店への奉公、公務員＝武士・役人、自分の店＝商い、都会＝江戸・大坂（東京・大阪）へ出る。
 * 身分の壁があり、百姓や町人の子が武士になることは、まずできなかった。割合は目安
 */
function findJobOld(state: GameState, p: Person, rng: Rng, year: number, level: 'middle' | 'high' | 'junior' | 'univ'): void {
  const wish = state.prefs.jobWish;
  const edo = isEdo(year);
  const fam = [0.75, 0.9, 1, 1.1, 1.25][p.familyClass - 1];
  // 東日本からは江戸（東京）、西日本からは大坂（大阪）へ出る
  const west = p.pref >= 25 && p.pref !== 47;
  const city = edo ? (west ? '大坂' : '江戸') : west ? '大阪' : '東京';
  const urban = S.METRO.has(p.pref) || p.movedToCity;
  const done = (job: Job, title: string, text: string, ok: boolean) => {
    startWork(p, job, title, year, `${year}年、${text}`);
    if (wish) p.wishes.push({ age: p.age, wish: jobWishLabel(wish, year), result: title, ok });
  };
  // 武士の家（江戸）：長男は家督を継ぐ見習いとして出仕。次男より下は、養子の口がなければ部屋住み（目安）
  if (edo && p.flags.includes('samurai_family') && p.sex === 'male') {
    if (p.flags.includes('samurai_heir')) return done('public', '藩に出仕した', '家督を継ぐ見習いとして、藩の役目に就いた。禄（給料）は家の格で決まっていた。', wish === 'public' || !wish);
    if (rng.chance(level === 'middle' ? 0.35 : 0.5)) return done('public', '養子に入った', 'ほかの武士の家に養子に入り、その家を継ぐことになった。次男より下の武士の子は、養子の口を探すのが常だった。', wish === 'public' || !wish);
    if (level === 'univ' || level === 'junior') return done('self', '学問で身を立てた', '学んだことを生かし、手習いの師匠や医者として身を立てた。', false);
    done('none', '部屋住みになった', '養子の口はなく、兄の家で部屋住み（家を継がない身）として暮らした。傘張りなどの内職で家計を助けた。', false);
    p.jobTitle = '部屋住み（内職）';
    return;
  }
  // 学問を続けた人（藩校・私塾・遊学）：医者・学者・手習いの師匠
  if (level === 'univ' || level === 'junior') {
    if (!edo && wish === 'public' && rng.chance(0.5 * fam)) return done('public', '役所に入った', '学んだことを生かし、役所に勤めることになった。', true);
    return done('self', level === 'univ' ? '医者・学者として身を立てた' : '手習いの師匠になった', level === 'univ' ? '学んだことを生かし、医者として開業した。' : '学んだことを生かし、子どもに読み書きを教える師匠になった。', wish === 'self' || !wish);
  }
  // 百姓の跡取りは家を継ぐ
  if (p.flags.includes('heir') && wish !== 'city' && rng.chance(0.92)) return done('farm', '家の田畑を継いだ', '長男なので、家の田畑を継ぐことになった。', wish === 'farm' || !wish);
  if (wish === 'public') {
    if (!edo && rng.chance(0.15 * fam)) return done('public', '役所に入った', '役所の小使い（雑用係）から勤め始めた。', true);
    p.wishes.push({ age: p.age, wish: jobWishLabel('public', year), result: edo ? '身分の壁で叶わなかった' : '叶わなかった', ok: false });
    startWork(p, 'smallco', edo ? '武家屋敷に奉公した' : '店に奉公した', year, edo ? `${year}年、武士になりたかったが、百姓や町人の子には、まずできなかった。武家屋敷に奉公に出た。` : `${year}年、役人になりたかったが、口はなかった。店に奉公に出た。`);
    return;
  }
  if (wish === 'city' || (wish === 'bigco' && !urban)) {
    p.movedToCity = true;
    const big = rng.chance(0.3 * fam);
    return done(big ? 'bigco' : 'smallco', `${city}に出て奉公した`, `${city}に出て、${big ? '大店（大きな商家）に丁稚奉公' : p.sex === 'male' ? '商家に奉公' : '商家に女中奉公'}に入った。${edo ? '奉公は、年季（約束の年数）を決めて住み込みで働くものだった。' : ''}`, true);
  }
  if (wish === 'bigco') {
    if (rng.chance(0.4 * fam)) return done('bigco', '大店に奉公した', `大店（大きな商家）に${p.sex === 'male' ? '丁稚' : '女中'}として奉公に入った。いずれは番頭、うまくいけば暖簾分け（独立）をめざす。`, true);
    return done('smallco', '小さな店に奉公した', '大店に入りたかったが、口がなく、近くの小さな店に奉公に入った。', false);
  }
  if (wish === 'self') {
    if (p.parentJob === 'self') return done('self', '家の商いを継いだ', '家の商いを手伝い、やがて継ぐことになった。', true);
    if (rng.chance(0.12 * fam)) return done('self', '小さな商いを始めた', '元手を借りて、振り売り（天秤棒をかついで売り歩く商い）から始めた。', true);
    return done('smallco', '奉公に出た', '自分の店を持ちたかったが、元手がなかった。まずは奉公に出た。', false);
  }
  if (wish === 'farm' || p.parentJob === 'farm') {
    if (p.parentJob === 'farm' && (p.birthOrder === 1 || rng.chance(p.sex === 'female' ? 0.7 : 0.45))) return done('farm', '家の田畑を手伝った', p.sex === 'female' ? '家の田畑と機織りを手伝った。' : '家の田畑を手伝った。次男より下は、いずれ分家するか、よその家に婿入りするか、奉公に出るかだった。', true);
  }
  if (p.parentJob === 'self') return done('self', '家の商いを手伝った', '家の商いを手伝った。', !wish);
  done('smallco', '奉公に出た', p.sex === 'female' ? '近くの商家に女中奉公に出た。' : '口入れ屋（仕事の世話をする店）の世話で、商家に奉公に出た。', !wish);
}

export function jobWishLabel(w: Job | 'city', year = 2000): string {
  if (year < 1890) return { farm: '家の仕事を継ぐこと', self: '自分の商い', smallco: '奉公', bigco: '大店への奉公', public: isEdo(year) ? '武士になること' : '役人になること', none: '働かない', city: isEdo(year) ? '江戸や大坂で働くこと' : '東京や大阪で働くこと' }[w];
  return { farm: '家業の農業', self: '自分の店', smallco: '地元の会社', bigco: '大企業', public: '公務員', none: '働かない', city: '都会で働くこと' }[w];
}

// ---------- 病気と治療費 ----------

/**
 * 医療費の自己負担の割合（目安）。制度の変わり目は docs/03 の F-1（厚労省「患者負担の推移」）に合わせた。
 * - 1961年 国民皆保険。それより前は、勤め人でなければ保険がないことが多い
 * - 勤め人本人：1984年まで定額（ほぼ0）→ 1割、1997年 2割、2003年 3割
 * - 家族・国保：5割 → 1973年から3割（家族）
 * - 70歳以上：1973〜82年は無料（老人医療費無料化）、1983年から定額の一部負担、2002年から1割（70〜74歳は2014年から2割）
 * - 子ども：2002年から3歳未満、2008年から小学校に上がる前は2割
 */
export function copayRate(year: number, age: number, employee: boolean): { rate: number; note: string } {
  // 健康保険法の施行（1927年）より前は、医療保険の仕組みがなかった
  if (year < 1927) return { rate: 1, note: '医療保険の仕組みがまだなく、全額を自分で払った' };
  if (age >= 70) {
    if (year >= 1973 && year <= 1982) return { rate: 0, note: '老人医療費の無料化で、自己負担はなかった' };
    if (year < 1973) return { rate: employee ? 0.05 : 0.5, note: '' };
    if (year < 2002) return { rate: 0.03, note: '老人保健制度の定額の負担だけだった' };
    if (age < 75 && year >= 2014) return { rate: 0.2, note: '70〜74歳は2割負担' };
    return { rate: 0.1, note: '高齢者は1割負担' };
  }
  if (age < 6 && year >= 2008) return { rate: 0.2, note: '小学校に上がる前の子は2割負担' };
  if (year < 1961 && !employee) return { rate: 1, note: '国民皆保険の前で、保険がなく全額を払った' };
  if (employee) {
    if (year < 1984) return { rate: 0.03, note: '勤め人本人は定額の負担だけだった' };
    if (year < 1997) return { rate: 0.1, note: '勤め人本人は1割負担' };
    if (year < 2003) return { rate: 0.2, note: '勤め人本人は2割負担' };
    return { rate: 0.3, note: '3割負担' };
  }
  if (year < 1973) return { rate: 0.5, note: '5割負担' };
  return { rate: 0.3, note: '3割負担' };
}

function illness(p: Person, rng: Rng, year: number): void {
  const a = p.age;
  if (a < 1) return;
  if (year < 1900) {
    // 病院がほとんどない時代：病気やけがで寝込み、医者にかかる。薬礼（医者への支払い）はすべて自分持ち（目安）
    const base = a < 15 ? 0.03 : a < 40 ? 0.02 : a < 65 ? 0.035 : 0.07;
    if (!rng.chance(base * (p.stats.health < 40 ? 1.8 : p.stats.health > 75 ? 0.7 : 1))) return;
    const what = a < 15 ? rng.pick(['はやり風邪', '麻疹（はしか）', 'ひどい腹くだし', 'けが']) : a < 50 ? rng.pick(['はやり風邪', '腹の病', 'けが', '目の病']) : rng.pick(['中風', '腹の病', 'けが', '目の病', 'はやり風邪']);
    const cost = 600000 * (S.incomeIndex(year) / 100) * 0.15 * (0.6 + rng.next() * 0.9);
    p.money -= cost;
    applyEffects(p, { health: -4, happiness: -6 });
    log(p, 'health', `${what}で寝込んだ`, `${year}年、${what}で寝込んだ。${p.familyClass >= 3 ? `医者にかかり、薬礼（医者への支払い）は${moneyAt(cost, year)}だった。` : '医者を呼ぶお金はなく、家の者の看病と、売薬でしのいだ。'}`, { heavy: what === '中風' });
    return;
  }
  // 入院するような病気やけがの確率（年あたりの目安）。年齢とともに増え、健康が低いと増える
  const base = a < 15 ? 0.012 : a < 40 ? 0.015 : a < 65 ? 0.03 : 0.07;
  const prob = base * (p.stats.health < 40 ? 1.8 : p.stats.health > 75 ? 0.7 : 1);
  if (!rng.chance(prob)) return;
  const employee = p.job === 'bigco' || p.job === 'smallco' || p.job === 'public' || (p.married && p.sex === 'female' && year >= 1961);
  // 1回の入院の医療費：2020年に約60万円として賃金の水準で動かす（目安）
  const cost = 600000 * (S.incomeIndex(year) / 100) * (0.6 + rng.next() * 0.9);
  const { rate, note } = copayRate(year, a, employee);
  const pay = cost * rate;
  p.money -= pay;
  const what = a < 15 ? rng.pick(['肺炎', '盲腸', '骨折']) : a < 50 ? rng.pick(['盲腸', '骨折', '胃潰瘍', '肺炎']) : rng.pick(['心臓の病気', '脳卒中', 'がん', '骨折', '肺炎']);
  applyEffects(p, { health: -4, happiness: -6 });
  const heavy = what === 'がん' || what === '脳卒中' || what === '心臓の病気';
  log(
    p,
    'health',
    `${what}で入院`,
    `${year}年、${what}で入院した。医療費は約${man(cost)}、${note || `自己負担は${Math.round(rate * 100)}%`}。払ったのは約${man(pay)}。`,
    { heavy },
  );
}

// ---------- 才能 ----------

/** 生まれつきの才能が、その時代に花開くか。1回きり、16〜30歳のどこかで */
function talentBloom(state: GameState, p: Person, rng: Rng, year: number): void {
  if (p.age < 16 || p.age > 30 || p.flags.includes('talent_checked')) return;
  if (!rng.chance(0.12)) return;
  p.flags.push('talent_checked');
  const t = state.shared.talent;
  const pre = year < 1955; // 戦中・戦後すぐ
  // 1890年より前（江戸・明治前半）の版
  const edoTable: Record<string, { p: number; ok: string; ng: string }> = {
    絵: { p: 0.15, ok: '絵の腕を見こまれ、絵師の工房に出入りして、版元の仕事を手伝うようになった。', ng: '絵がうまいと言われたが、紙も絵の具も高く、描く暇もなかった。' },
    音楽: { p: 0.15, ok: '三味線と唄の腕が評判になり、祭りや宴に呼ばれるようになった。', ng: '唄がうまかったが、それを生かす場は祭りの日くらいだった。' },
    運動: { p: 0.25, ok: '力の強さを買われ、村の草相撲で大関を張った。', ng: '体は丈夫だったが、それは野良仕事に使われるだけだった。' },
    計算: { p: 0.35, ok: 'そろばんの腕を見こまれ、帳場（店の勘定）を任された。', ng: '計算は速かったが、帳面を任されるのは家の跡取りや番頭だけだった。' },
    話すこと: { p: 0.3, ok: '口がうまく、行商や店先で客をつかむのが得意になった。', ng: '話すのは得意だったが、目上に意見することは許されなかった。' },
    手先の器用さ: { p: 0.45, ok: '器用さを見こまれ、職人の親方に弟子入りして腕を磨いた。', ng: '手先は器用だったが、弟子入りの口はなかった。' },
    文章: { p: 0.15, ok: '詠んだ句が評判になり、俳諧の集まりに招かれるようになった。', ng: '文章を書くのが好きだったが、紙は高く、読める人も多くなかった。' },
    人の世話: { p: 0.35, ok: '面倒見のよさで、村や長屋で頼りにされた。取り上げ（お産の手伝い）を頼まれることもあった。', ng: '人の世話が得意だったが、それは仕事とは見なされなかった。' },
  };
  const table: Record<string, { p: number; ok: string; ng: string }> = {
    絵: year < 1955
      ? { p: 0.1, ok: '絵の才を見こまれ、看板屋に弟子入りした。', ng: '絵がうまいと言われたが、描く暇も紙もなかった。' }
      : year < 1995
        ? { p: 0.35, ok: '漫画を描いて雑誌に投稿し、小さな賞をもらった。', ng: '漫画家を目指したが、その道は狭かった。' }
        : { p: 0.45, ok: 'デジタルで描いた絵をネットに上げると、思いがけず多くの人に見られた。', ng: '絵を描き続けたが、仕事にはならなかった。' },
    音楽: pre
      ? { p: 0.08, ok: year < 1946 ? '祭りや宴で歌い、町で評判になった。' : 'のど自慢で歌い、町で評判になった。', ng: '歌がうまかったが、それを生かす場はなかった。' }
      : year < 2005
        ? { p: 0.3, ok: '仲間とバンドを組み、ライブハウスに立った。', ng: 'バンドを組んだが、楽器を買うお金が続かなかった。' }
        : { p: 0.4, ok: '演奏の動画を投稿し、知らない人から感想が届いた。', ng: '音楽を続けたが、仕事にはならなかった。' },
    運動: pre
      ? { p: 0.15, ok: '足の速さを買われ、地元の大会で優勝した。', ng: '運動が得意だったが、食べ物も道具も足りなかった。' }
      : { p: 0.35, ok: '部活で県大会に出た。運動の才は、本人の自信になった。', ng: '運動が得意だったが、けがで続けられなかった。' },
    計算: year < 1975
      ? { p: 0.4, ok: 'そろばんの腕を見こまれ、経理の仕事を任された。', ng: '計算は速かったが、上の学校には行けなかった。' }
      : { p: 0.45, ok: 'プログラムを書くのが得意になり、仕事で重宝された。', ng: '数字に強かったが、それを生かす仕事に就けなかった。' },
    話すこと: { p: 0.35, ok: '人前で話すのがうまく、営業の仕事で頼りにされた。', ng: '話すのは得意だったが、口下手な職場では浮いてしまった。' },
    手先の器用さ: year < 1975
      ? { p: 0.45, ok: '器用さを見こまれ、職人として腕を磨いた。', ng: '手先は器用だったが、機械に仕事を取られていった。' }
      : { p: 0.3, ok: '器用さを生かして、ものづくりの仕事に就いた。', ng: '手先は器用だったが、趣味の域を出なかった。' },
    文章: pre
      ? { p: 0.1, ok: '綴り方がほめられ、新聞に載った。', ng: '文章を書くのが好きだったが、紙も本も足りなかった。' }
      : { p: 0.3, ok: '書いた文章が賞を取り、名前が雑誌に載った。', ng: '文章を書き続けたが、読まれる場はなかった。' },
    人の世話: year < 1990
      ? { p: 0.3, ok: '面倒見のよさで、家族や近所から頼りにされた。', ng: '人の世話が得意だったが、それは仕事とは見なされなかった。' }
      : { p: 0.45, ok: '人の世話が得意で、介護や看護の仕事で頼りにされた。', ng: '人の世話が得意だったが、その仕事の給料は低かった。' },
  };
  const row = (year < 1890 ? edoTable[t] : table[t]) ?? { p: 0.3, ok: '才能が花開いた。', ng: '才能はあったが、生かす場がなかった。' };
  const ok = rng.chance(row.p * [0.7, 0.85, 1, 1.15, 1.3][p.familyClass - 1]);
  if (ok) {
    p.flags.push('talent_bloom');
    applyEffects(p, { happiness: 10, knowledge: 4 });
  } else {
    p.wishes.push({ age: p.age, wish: `「${t}」の才能を生かすこと`, result: '時代が許さなかった', ok: false });
  }
  log(p, ok ? 'event' : 'wish', ok ? `${t}の才能が花開いた` : `${t}の才能`, ok ? row.ok : row.ng);
}
