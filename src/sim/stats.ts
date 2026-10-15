// data/stats/*.json を読み、年・年齢・性別で値を引く。
// ファイルがまだない、またはその年の値がないときは、近い年から直線で補間する。
// それでも値がないときだけ、ここに書いた目安を使う（目安を使ったことは usedFallback に残す）。

import type { Edu, Sex } from './types';

type AnyJson = any;

const files = import.meta.glob(['../../data/stats/*.json', '!../../data/stats/mortality_variants.json'], { eager: true, import: 'default' }) as Record<string, AnyJson>;

function file(name: string): AnyJson | undefined {
  return files[`../../data/stats/${name}.json`];
}

export const usedFallback = new Set<string>();

// 1930年より前（1890〜1929年）の統計。資料と推計（docs/03 の H・I 節）。1930年以降は既存のファイルを使う
const prewarPop = file('prewar_population');
const prewarSoc = file('prewar_social');
// 1890年より前（1800〜1889年、江戸後期〜明治前半）の統計。歴史人口学の研究などからの推計（docs/03 の J 節）
const edo = file('edo');
/** つないだ表は、一度作ったら使い回す（毎回作ると遅いため） */
const joinedCache = new Map<string, Record<string, number> | undefined>();
function joined(key: string, make: () => Record<string, number> | undefined): Record<string, number> | undefined {
  if (!joinedCache.has(key)) joinedCache.set(key, make());
  return joinedCache.get(key);
}

/** 古い年の表を、新しい表の前につなぐ（新しい表の最初の年より前の年だけを使う） */
function joinPrewar(pre: Record<string, number> | undefined, post: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!pre) return post;
  if (!post) return pre;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(pre)) if (Number(k) < Math.min(...Object.keys(post).map(Number))) out[k] = v;
  return { ...out, ...post };
}

/** 江戸 → 明治・大正 → 1930年以降の順につなぐ */
function joinAll(...tables: (Record<string, number> | undefined)[]): Record<string, number> | undefined {
  return tables.reduce<Record<string, number> | undefined>((acc, t) => joinPrewar(acc, t), undefined);
}

/** 江戸時代（廃藩置県の1871年より前）は、いまの県の代わりに当時の国の名前で呼ぶ。県の範囲と国は一致しないので、その県のおもな国（目安） */
export const KUNI = [
  '蝦夷地', '陸奥', '陸奥', '陸奥', '出羽', '出羽', '陸奥', '常陸', '下野', '上野',
  '武蔵', '下総', '江戸', '相模', '越後', '越中', '加賀', '越前', '甲斐', '信濃',
  '美濃', '駿河', '尾張', '伊勢', '近江', '京', '大坂', '播磨', '大和', '紀伊',
  '因幡', '出雲', '備前', '安芸', '長門', '阿波', '讃岐', '伊予', '土佐', '筑前',
  '肥前', '肥前', '肥後', '豊後', '日向', '薩摩', '琉球',
] as const;

/** その年の呼び方で、生まれた場所を書く（1871年より前は「信濃（いまの長野県）」） */
export function placeName(pref: number, year: number): string {
  const now = PREFS[pref - 1];
  return year < 1871 ? `${KUNI[pref - 1]}（いまの${now}）` : now;
}

/** 中くらいの欄のための呼び方（1871年より前は「信濃（長野）」、それ以降は「長野県」） */
export function placeMid(pref: number, year: number): string {
  return year < 1871 ? `${KUNI[pref - 1]}（${PREFS[pref - 1].replace(/[都府県]$/, '')}）` : PREFS[pref - 1];
}

/** 狭い欄のための短い呼び方（1871年より前は「信濃」、それ以降は「長野」） */
export function placeShort(pref: number, year: number): string {
  return year < 1871 ? KUNI[pref - 1] : PREFS[pref - 1].replace(/[都府県]$/, '');
}

export const PREFS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const;

/** 大都市圏（上京・都会の判定に使う） */
export const METRO = new Set([11, 12, 13, 14, 23, 26, 27, 28]);

/** { "1950": 1.2, "1960": 3.4 } のような表から、year の値を直線補間で引く。範囲外は端の値 */
export function interp(table: Record<string, number> | undefined, year: number): number | undefined {
  if (!table) return undefined;
  const keys = Object.keys(table)
    .map(Number)
    .filter((k) => Number.isFinite(k) && typeof table[String(k)] === 'number')
    .sort((a, b) => a - b);
  if (keys.length === 0) return undefined;
  if (year <= keys[0]) return table[String(keys[0])];
  if (year >= keys[keys.length - 1]) return table[String(keys[keys.length - 1])];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (year >= a && year <= b) {
      const va = table[String(a)];
      const vb = table[String(b)];
      return va + ((vb - va) * (year - a)) / (b - a);
    }
  }
  return undefined;
}

/** { "1950": {male: 1, female: 2} } から field を取り出した表にする */
function pluck(table: AnyJson, field: string): Record<string, number> | undefined {
  if (!table || typeof table !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(table)) {
    const x = (v as AnyJson)?.[field];
    if (typeof x === 'number') out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

function fb<T>(key: string, value: T): T {
  usedFallback.add(key);
  return value;
}

// ---------- 死亡 ----------

const mortality = file('mortality');

/** 年齢別死亡確率 qx。目安：ゴンペルツ・メイカム型（データがないときだけ） */
export function qx(year: number, age: number, sex: Sex): number {
  const a = Math.min(Math.max(0, Math.floor(age)), 105);
  if (year < 1890 && edo?.mortality) {
    const v = edoQx(year, a, sex);
    if (v !== undefined) return v;
  }
  if (year < 1930 && prewarPop?.mortality) {
    const py = Math.max(year, 1890);
    const row = prewarPop.mortality[String(py)];
    const arr = row?.[sex];
    if (Array.isArray(arr) && typeof arr[a] === 'number') return arr[a];
  }
  const y = Math.min(Math.max(year, 1930), 2070);
  const ys = mortality?.years;
  if (ys) {
    let row = ys[String(y)];
    if (!row) {
      // 近い年を探す
      for (let d = 1; d < 20 && !row; d++) row = ys[String(y - d)] || ys[String(y + d)];
    }
    const arr = row?.[sex];
    if (Array.isArray(arr) && typeof arr[a] === 'number') return arr[a];
  }
  usedFallback.add('mortality');
  // 目安：平均寿命が 1930年45歳 → 2020年84歳 になるように動かす
  const t = Math.min(1, Math.max(0, (y - 1930) / 90));
  const infant = 0.12 * (1 - t) + 0.002 * t;
  if (a === 0) return infant * (sex === 'male' ? 1.1 : 0.9);
  const makeham = 0.006 * (1 - t) + 0.0002 * t;
  const g = Math.exp(-10.5 + 0.085 * a + (sex === 'male' ? 0.3 : 0) - 1.2 * t);
  return Math.min(1, makeham + g + (a < 5 ? infant * 0.15 : 0));
}

export const mortalityMeta = mortality?.meta;

/** 江戸・明治前半の死亡確率：アンカー年の表のあいだを直線で補い、飢饉や疫病の年は倍率をかける（data/stats/edo.json） */
const edoQxCache = new Map<string, number[]>();
function edoQx(year: number, a: number, sex: Sex): number | undefined {
  const y = Math.max(1790, Math.min(1889, year));
  const key = `${y}-${sex}`;
  let arr = edoQxCache.get(key);
  if (!arr) {
    const anchors = Object.keys(edo.mortality)
      .map(Number)
      .filter((k) => Array.isArray(edo.mortality[String(k)]?.[sex]))
      .sort((p, q) => p - q);
    if (!anchors.length) return undefined;
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];
    for (const k of anchors) {
      if (k <= y) lo = k;
      if (k >= y && hi >= k) hi = k;
    }
    if (hi < lo) hi = lo;
    const A: number[] = edo.mortality[String(lo)][sex];
    const B: number[] = edo.mortality[String(hi)][sex];
    const t = hi === lo ? 0 : (y - lo) / (hi - lo);
    arr = A.map((v, i) => v + ((B[i] ?? v) - v) * t);
    edoQxCache.set(key, arr);
  }
  const base = arr[Math.min(a, arr.length - 1)];
  if (typeof base !== 'number') return undefined;
  const c = crisisAt(year, a);
  return Math.min(1, base * (c?.mult ?? 1));
}

export interface Crisis {
  year: number;
  endYear?: number;
  ageMin?: number;
  ageMax?: number;
  mult: number;
  cause: string;
  note?: string;
  source?: string;
}

/** その年・その年齢に、飢饉や疫病による死亡の山があるか（江戸・明治前半） */
export function crisisAt(year: number, age: number): Crisis | undefined {
  const list: Crisis[] = Array.isArray(edo?.crisis) ? edo.crisis : [];
  return list.find((c) => year >= c.year && year <= (c.endYear ?? c.year) && age >= (c.ageMin ?? 0) && age <= (c.ageMax ?? 120));
}

// ---------- 出生 ----------

const births = file('births');

export function nationalBirths(year: number): number {
  const t = joined('births', () => joinAll(edo?.births, pluck(prewarPop?.births, 'total'), pluck(births?.national, 'total')));
  return interp(t, year) ?? fb('births', 2_000_000);
}

export function prefBirths(year: number): number[] {
  const p = births?.prefecture;
  if (p) {
    const keys = Object.keys(p).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    for (const k of keys) if (Math.abs(k - year) < Math.abs(best - year)) best = k;
    const row = p[String(best)];
    if (Array.isArray(row) && row.length === 47) {
      const out = row.map((x: number) => Math.max(0, x || 0));
      // 1930年より前は1930年の県別の出生数を使う。1890年より前は、人の少なかった蝦夷地（北海道。開拓は1869年から）と、
      // 1930年には人の集まっていた大都市（東京・大阪・神奈川）の重みを下げる（目安。江戸の町の人口は100万人ほどとされる）
      if (year < 1900) {
        const hk = year < 1869 ? 0.05 : Math.min(1, 0.05 + ((year - 1869) / 31) * 0.95);
        out[0] *= hk;
        if (year < 1890) {
          out[12] *= 0.6;
          out[26] *= 0.7;
          out[13] *= 0.7;
        }
      }
      return out;
    }
  }
  usedFallback.add('prefBirths');
  return PREFS.map((_, i) => (i === 12 ? 6 : i === 26 ? 4 : 1.5));
}

const sexratio = file('sexratio');
export function sexRatio(year: number): number {
  return interp(sexratio?.years, year) ?? fb('sexratio', 105.5);
}

// ---------- 教育 ----------

const education = file('education');

/** 進学率（%） */
export function eduRate(kind: 'highSchool' | 'university' | 'juniorCollege', year: number, sex: Sex): number {
  // 1930年より前は、旧制の学校への進学率（中等教育＝highSchool、高等教育＝university、短大にあたるものは0）
  if (year < 1890 && edo?.education) {
    if (kind === 'juniorCollege') return 0;
    const v0 = interp(pluck(kind === 'highSchool' ? edo.education.secondary : edo.education.higher, sex), year);
    if (v0 !== undefined) return v0;
  }
  if (year < 1930 && prewarSoc?.education) {
    if (kind === 'juniorCollege') return 0;
    const t = pluck(kind === 'highSchool' ? prewarSoc.education.secondary : prewarSoc.education.higher, sex);
    const v0 = interp(t, year);
    if (v0 !== undefined) return v0;
  }
  const v = interp(pluck(education?.[kind], sex), year);
  if (v !== undefined) return v;
  usedFallback.add('education');
  const t = Math.min(1, Math.max(0, (year - 1950) / 50));
  if (kind === 'highSchool') return year < 1950 ? 20 : 42 + 55 * Math.min(1, (year - 1950) / 25);
  if (kind === 'university') return (sex === 'male' ? 8 : 2) + t * (sex === 'male' ? 40 : 45);
  return sex === 'male' ? 2 : 3 + t * 15;
}

/** 義務教育（尋常小学校）の就学率（%）。1930年以降はほぼ全員とみなす */
export function elementaryEnrollment(year: number, sex: Sex): number {
  if (year >= 1930) return 99.5;
  const v = interp(joined(`elem-${sex}`, () => joinPrewar(pluck(edo?.education?.elementaryEnrollment, sex), pluck(prewarSoc?.education?.elementaryEnrollment, sex))), year);
  return v ?? fb('elementaryEnrollment', 99);
}

// ---------- 労働 ----------

const labor = file('labor');

export function unemployment(year: number): number {
  const v = interp(pluck(labor?.unemployment, 'total'), year);
  return v ?? fb('unemployment', 3);
}

export function jobOpenings(year: number): number {
  return interp(labor?.jobOpenings, year) ?? fb('jobOpenings', 1.0);
}

/** 新規学卒の求人倍率。その学歴の値がない年は undefined */
export function newGradRatio(level: 'middle' | 'high' | 'univ', year: number): number | undefined {
  const t = labor?.newGradJobRatio?.[level];
  if (!t) return undefined;
  const keys = Object.keys(t).map(Number);
  if (!keys.length) return undefined;
  if (year < Math.min(...keys) - 1 || year > Math.max(...keys) + 1) return undefined;
  return interp(t, year);
}

// ---------- 産業（親の職業） ----------

const industry = file('industry');

export function primaryShare(year: number): number {
  return interp(joined('primary', () => joinAll(edo?.primaryShare, prewarSoc?.primaryShare, industry?.primaryShare)), year) ?? fb('industry', 30);
}
export function employeeShare(year: number): number {
  return interp(joined('employee', () => joinAll(edo?.employeeShare, prewarSoc?.employeeShare, industry?.employeeShare)), year) ?? fb('industry', 60);
}
/** 人口のうち武士（家族を含む）の割合（%）。1871年の廃藩置県・四民平等より後は0 */
export function samuraiShare(year: number): number {
  if (year >= 1872) return 0;
  return interp(edo?.samuraiShare, year) ?? fb('samuraiShare', 6);
}
export function largeShare(year: number): number {
  return interp(industry?.largeShareOfEmployees, year) ?? 25;
}
export function publicShare(year: number): number {
  return interp(industry?.publicShareOfEmployees, year) ?? 9;
}

// ---------- 結婚 ----------

const marriage = file('marriage');

export function meanMarriageAge(year: number, sex: Sex): number {
  return interp(joined(`marriageAge-${sex}`, () => joinAll(pluck(edo?.meanFirstMarriageAge, sex), pluck(prewarSoc?.meanFirstMarriageAge, sex), pluck(marriage?.meanFirstMarriageAge, sex))), year) ?? fb('marriage', sex === 'male' ? 28 : 25);
}

/** 50歳時未婚割合（%） */
export function neverMarried50(year: number, sex: Sex): number {
  return interp(joined(`never50-${sex}`, () => joinAll(pluck(edo?.neverMarriedAt50, sex), pluck(prewarSoc?.neverMarriedAt50, sex), pluck(marriage?.neverMarriedAt50, sex))), year) ?? fb('marriage', 5);
}

/** 結婚した女性が一生に産む子の数の目安（江戸・明治前半）。ないときは undefined */
export function completedFertility(year: number): number | undefined {
  return interp(edo?.completedFertility, year);
}

// ---------- 賃金・物価 ----------

const wages = file('wages');
const cpiFile = file('cpi');

/** 統計がある最後の年 */
function lastKey(t: Record<string, number> | undefined): number | undefined {
  if (!t) return undefined;
  const ks = Object.keys(t).map(Number).filter(Number.isFinite);
  return ks.length ? Math.max(...ks) : undefined;
}

/**
 * 名目賃金の水準（2020=100）。統計がない未来は、物価を2025年で止めたうえで（＝2025年の物価で表す）、
 * 実質賃金が年1.1%ずつ伸びるとみなす。2024年財政検証の実質賃金上昇率の前提（成長型経済移行・継続ケース1.5%、過去30年投影ケース0.5%）の中間（目安）
 */
export function incomeIndex(year: number): number {
  const t = joined('income', () => joinAll(edo?.annualIncomeIndex, prewarSoc?.annualIncomeIndex, wages?.annualIncomeIndex as Record<string, number> | undefined));
  const last = lastKey(t);
  if (t && last !== undefined) {
    if (year <= last) return interp(t, year)!;
    return t[String(last)] * Math.pow(1.011, year - last);
  }
  usedFallback.add('wages');
  // 目安：1950年代〜90年代に大きく伸び、その後は横ばい
  const base = year <= 1997 ? 100 * Math.exp((year - 1997) * 0.075) : 100 * Math.pow(1.002, year - 1997);
  return year > 2025 ? base * Math.pow(1.011, year - 2025) : base;
}

export function cpi(year: number): number {
  return interp(joined('cpi', () => joinAll(edo?.cpi, prewarSoc?.cpi, cpiFile?.years)), Math.min(year, 2025)) ?? fb('cpi', year <= 1995 ? 100 * Math.exp((year - 1995) * 0.06) : 100);
}

/** その年の1円が、2020年の何円にあたるか（未来は2025年の物価で止める） */
export function toReal2020(year: number): number {
  return cpi(2020) / cpi(Math.min(year, 2025));
}

const AGE_GROUPS = ['15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-'];

function ageGroup(age: number): string {
  if (age < 20) return '15-19';
  if (age >= 70) return '70-';
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 4}`;
}

/** 年齢・性・学歴別の年収（円、名目）。基準年の形を、賃金の水準でその年に合わせる */
export function annualWage(year: number, age: number, sex: Sex, edu: Edu): number {
  const prof = wages?.profile;
  const e: Edu = edu === 'none' ? 'middle' : edu;
  if (prof) {
    const bases = Object.keys(prof).map(Number).sort((a, b) => a - b);
    let base = bases[0];
    for (const b of bases) if (Math.abs(b - year) < Math.abs(base - year)) base = b;
    const tbl = prof[String(base)]?.[sex]?.[e] ?? prof[String(base)]?.[sex]?.high;
    if (tbl) {
      let g = ageGroup(age);
      let v = tbl[g];
      if (typeof v !== 'number') {
        // 端の年齢は近い年齢層を使う
        const idx = AGE_GROUPS.indexOf(g);
        for (let d = 1; d < AGE_GROUPS.length && typeof v !== 'number'; d++) {
          v = tbl[AGE_GROUPS[idx - d]] ?? tbl[AGE_GROUPS[idx + d]];
        }
      }
      if (typeof v === 'number') return v * 10000 * (incomeIndex(year) / incomeIndex(base));
    }
  }
  usedFallback.add('wageProfile');
  // 目安：2020年の大卒男性の年収カーブに近い形
  const peak = sex === 'male' ? 650 : 420;
  const eduF = { none: 0.7, middle: 0.72, high: 0.8, junior: 0.85, univ: 1 }[edu];
  const shape = Math.max(0.35, 1 - Math.pow((age - 52) / 32, 2));
  return peak * eduF * shape * 10000 * (incomeIndex(year) / 100);
}

// ---------- 年金 ----------

const pension = file('pension');

/** 厚生年金（報酬比例部分）の支給開始年齢。生まれた日で決まる */
export function pensionStartAge(birthYear: number, birthMonth: number, sex: Sex): number {
  const rows: AnyJson[] | undefined = pension?.startAge;
  const d = `${birthYear}-${String(birthMonth).padStart(2, '0')}-15`;
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if ((r.sex === sex || r.sex === 'any') && d >= r.from && d <= r.to) {
        return Number(r.earningsPart ?? r.age ?? 65);
      }
    }
  }
  usedFallback.add('pensionStartAge');
  // 2026年10月14日に確かめた範囲（docs/03 の C-3、日本年金機構「年金給付の経過措置一覧」）。男性は1953年度生まれまで60歳
  const fy = birthMonth >= 4 ? birthYear : birthYear - 1; // 4月2日始まりの年度で近似
  if (sex === 'male') {
    if (fy < 1953) return 60;
    if (fy < 1955) return 61;
    if (fy < 1957) return 62;
    if (fy < 1959) return 63;
    if (fy < 1961) return 64;
    return 65;
  }
  // 女性：1932年4月1日以前の生まれは55歳。そこから2年ごとに1歳ずつ上がり、1940年4月2日以降の生まれは60歳
  // （日本年金機構「年金給付の経過措置一覧」）
  if (fy < 1932) return 55;
  if (fy < 1934) return 56;
  if (fy < 1936) return 57;
  if (fy < 1938) return 58;
  if (fy < 1940) return 59;
  if (fy < 1958) return 60;
  if (fy < 1960) return 61;
  if (fy < 1962) return 62;
  if (fy < 1964) return 63;
  if (fy < 1966) return 64;
  return 65;
}

export function pensionAverageMonthly(year: number): number | undefined {
  return interp(pension?.averageMonthly?.employees, year);
}

/** 1930年より前の名前（あれば）。{ "1890": {male:[], female:[]} } */
export const prewarNames: Record<string, { male: string[]; female: string[] }> | undefined = prewarSoc?.names;
/** 江戸・明治前半の名前（あれば）。形は prewarNames と同じ */
export const edoNames: Record<string, { male: string[]; female: string[] }> | undefined = edo?.names;

export const statsMeta = {
  edo: edo?.meta,
  prewarPopulation: prewarPop?.meta,
  prewarSocial: prewarSoc?.meta,
  mortality: mortality?.meta,
  births: births?.meta,
  education: education?.meta,
  labor: labor?.meta,
  marriage: marriage?.meta,
  wages: wages?.meta,
  pension: pension?.meta,
  cpi: cpiFile?.meta,
  industry: industry?.meta,
};
