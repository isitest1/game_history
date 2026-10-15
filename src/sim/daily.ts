// 日常と心の声。毎年、生きている人それぞれに、暮らしの場面と、そのとき思ったことを出す。
// 書き方とデータの形は docs/07_日常と心の声.md。
// - 場面の文章は data/daily/*.json（時代・年齢・家族・仕事・気分で選ぶ）
// - 親友・配偶者・子ども・ペットの名前、記念日、生存割合、回想は、ここでプログラムで作る
// - 日常は健康を動かさない（死亡率は生命表に合わせてあるため）

import type { Rng } from './rng';
import * as S from './stats';
import { pickGivenName } from './names';
import type { Job, LogEntry, Person } from './types';

export interface DailyWhen {
  sex?: 'male' | 'female';
  married?: boolean;
  widowed?: boolean;
  hasChildren?: boolean;
  childAge?: [number, number];
  hasSibling?: boolean;
  mother?: boolean;
  father?: boolean;
  school?: 'elem' | 'middle' | 'high' | 'univ';
  working?: boolean;
  job?: Job[];
  retired?: boolean;
  urban?: boolean;
  rich?: boolean;
  poor?: boolean;
  mood?: 'low' | 'high';
  sick?: boolean;
  flags?: string[];
  notFlags?: string[];
  trigger?: Trigger;
  region?: Region[];
  prefs?: number[];
  snow?: boolean;
}

export type Region = 'hokkaido' | 'tohoku' | 'kanto' | 'hokuriku' | 'koshin' | 'tokai' | 'kinki' | 'chugoku' | 'shikoku' | 'kyushu' | 'okinawa';

/** 県番号（JIS）から地方へ */
export function regionOf(pref: number): Region {
  if (pref === 1) return 'hokkaido';
  if (pref <= 7) return 'tohoku';
  if (pref <= 14) return 'kanto';
  if (pref <= 18) return 'hokuriku';
  if (pref <= 20) return 'koshin';
  if (pref <= 24) return 'tokai';
  if (pref <= 30) return 'kinki';
  if (pref <= 35) return 'chugoku';
  if (pref <= 39) return 'shikoku';
  if (pref <= 46) return 'kyushu';
  return 'okinawa';
}

/** 雪の多い県（県全体でみた目安。docs/07） */
export const SNOW_PREFS = new Set([1, 2, 3, 4, 5, 6, 7, 15, 16, 17, 18, 20, 31]);

export type Trigger = 'married' | 'child' | 'parent_death' | 'spouse_death' | 'job' | 'retire' | 'ill' | 'wish_fail' | 'moved' | 'school';

export interface DailyItem {
  id: string;
  kind: 'daily' | 'think';
  ageMin: number;
  ageMax: number;
  yearMin?: number;
  yearMax?: number;
  when?: DailyWhen;
  text: string;
  effects?: { health?: number; happiness?: number; knowledge?: number; relation?: number };
  weight?: number;
  repeatGap?: number;
  check?: string;
  /** この年より前には出さない（時代を問わない場面のうち、江戸・明治の初めに合わないもの。重みは変えない） */
  notBefore?: number;
}

const files = import.meta.glob('../../data/daily/*.json', { eager: true, import: 'default' }) as Record<string, DailyItem[]>;
export const DAILY: DailyItem[] = Object.entries(files).flatMap(([f, arr]) =>
  (Array.isArray(arr) ? arr : []).map((d) => ({ ...d, id: `${f.replace(/^.*\/|\.json$/g, '')}:${d.id}` })),
);

// 本文から分かる前提。条件を書き忘れた場面でも、働いていない人に職場の場面、学校に通っていない人に授業の場面が出ないようにする
const WORK_WORDS = /職場|上司|残業|同僚|課長|部長|係長|部下|取引先|出勤|通勤電車|社員旅行|会社の|ボーナス|昇進|作業着|定時|商談|営業先|名刺/;
const NOT_WORK = /退職|定年|辞め|やめた|就職|面接|内定|初出勤|入社/;
const SCHOOL_WORDS = /授業|教室|部活|担任|修学旅行|放課後|期末|中間テスト|校門|制服|通学|クラスメート|下校|登校/;
const UNIV_WORDS = /講義|ゼミ|キャンパス|学食|単位|サークル|卒論/;
const needsWork = (d: DailyItem) => WORK_WORDS.test(d.text) && !NOT_WORK.test(d.text) && d.when?.working === undefined && !d.when?.retired && !d.when?.job;
const needsSchool = (d: DailyItem) => SCHOOL_WORDS.test(d.text) && !d.when?.school && d.when?.working === undefined;
const needsUniv = (d: DailyItem) => UNIV_WORDS.test(d.text) && !d.when?.school;
const NEWLYWED = /新婚|結婚して初めて|結婚したばかり|結婚の報告/;
const GRANDCHILD = /孫/;
const SELF_GRANDMA = /ばあば|おばあちゃんと呼ばれ/;
const SELF_GRANDPA = /じいじ|おじいちゃんと呼ばれ/;
const needsLoan = (d: DailyItem) => /奨学金/.test(d.text) && !d.when?.flags?.includes('student_loan');

// 年齢と種類（日常／心の声／土地の日常）ごとに引けるように分けておく
const BY_AGE: Record<'daily' | 'think' | 'local', DailyItem[][]> = { daily: [], think: [], local: [] };
for (const d of DAILY) {
  const local = d.kind === 'daily' && !!(d.when?.region || d.when?.prefs || d.when?.snow);
  for (let a = Math.max(0, d.ageMin); a <= Math.min(120, d.ageMax); a++) {
    (BY_AGE[d.kind][a] ??= []).push(d);
    if (local) (BY_AGE.local[a] ??= []).push(d);
  }
}

/** 差し込みの一覧。本文に出てくるものは、その人に当てはまるときだけ選ばれる */
const SLOTS = ['name', 'friend', 'spouse', 'child', 'childAge', 'sib', 'pet', 'pref', 'mAge', 'fAge'] as const;

export interface DailyCtx {
  year: number;
  triggers: Set<Trigger>;
  log: (kind: 'daily' | 'think', title: string, text: string, extra?: Partial<LogEntry>) => void;
  applyEffects: (eff: DailyItem['effects']) => void;
}

/** その年の出来事から、心の声のきっかけを拾う */
export function triggersOf(p: Person, entries: LogEntry[], was: { retired: boolean; moved: boolean }): Set<Trigger> {
  const t = new Set<Trigger>();
  for (const e of entries) {
    if (e.kind === 'family' && /結婚$/.test(e.title)) t.add('married');
    if (e.kind === 'family' && /子が生まれた$/.test(e.title)) t.add('child');
    if (e.kind === 'family' && /^(父|母)が亡くなった$/.test(e.title)) t.add('parent_death');
    if (e.kind === 'family' && e.title === '配偶者を亡くした') t.add('spouse_death');
    if (e.kind === 'work' && !/定年|退いた/.test(e.title)) t.add('job');
    if (e.kind === 'health') t.add('ill');
    if (e.kind === 'wish') t.add('wish_fail');
    if (e.kind === 'school') t.add('school');
  }
  if (p.wishes.some((w) => w.age === p.age && !w.ok)) t.add('wish_fail');
  if (p.retired && !was.retired) t.add('retire');
  if (p.movedToCity && !was.moved) t.add('moved');
  return t;
}

function schoolOf(p: Person): DailyWhen['school'] | null {
  const a = p.age;
  if (p.inSchool === 'high') return 'high';
  if (p.inSchool === 'univ' || p.inSchool === 'junior') return 'univ';
  if (p.inSchool === 'none' && a >= 6 && a <= 11) return 'elem';
  if (p.inSchool === 'none' && a >= 12 && a <= 14) return 'middle';
  return null;
}

const working = (p: Person) => !!p.job && p.job !== 'none' && !p.retired;
const urban = (p: Person) => S.METRO.has(p.pref) || p.movedToCity;
const parentAge = (p: Person, who: 'm' | 'f', year: number) => year - (who === 'm' ? p.motherBirthYear : p.fatherBirthYear);
const childAgeOf = (c: { birthYear: number }, year: number) => year - c.birthYear;

function okWhen(p: Person, w: DailyWhen | undefined, ctx: DailyCtx): boolean {
  if (!w) return true;
  const y = ctx.year;
  if (w.sex && w.sex !== p.sex) return false;
  if (w.married !== undefined && w.married !== (p.married && p.spouseAlive)) return false;
  if (w.widowed && !(p.married && !p.spouseAlive)) return false;
  const kids = p.children.filter((c) => c.alive);
  if (w.hasChildren !== undefined && w.hasChildren !== kids.length > 0) return false;
  if (w.childAge && !kids.some((c) => childAgeOf(c, y) >= w.childAge![0] && childAgeOf(c, y) <= w.childAge![1])) return false;
  if (w.hasSibling !== undefined && w.hasSibling !== p.siblings > 1) return false;
  if (w.mother !== undefined && w.mother !== p.motherAlive) return false;
  if (w.father !== undefined && w.father !== p.fatherAlive) return false;
  if (w.school && w.school !== schoolOf(p)) return false;
  if (w.working !== undefined && w.working !== working(p)) return false;
  if (w.job && !(p.job && w.job.includes(p.job) && !p.retired)) return false;
  if (w.retired !== undefined && w.retired !== p.retired) return false;
  if (w.urban !== undefined && w.urban !== urban(p)) return false;
  if (w.rich && p.familyClass < 4) return false;
  if (w.poor && p.familyClass > 2) return false;
  if (w.mood === 'low' && p.stats.happiness >= 35) return false;
  if (w.mood === 'high' && p.stats.happiness < 70) return false;
  if (w.sick && p.stats.health >= 40) return false;
  if (w.flags && !w.flags.every((f) => p.flags.includes(f))) return false;
  if (w.notFlags && w.notFlags.some((f) => p.flags.includes(f))) return false;
  if (w.trigger && !ctx.triggers.has(w.trigger)) return false;
  // 地方や県の場面は、生まれた県に住んでいる人だけ（都会へ出た人には、上京した人向けと書いた場面だけを出す）
  const leftHome = p.movedToCity && !S.METRO.has(p.pref);
  if ((w.region || w.prefs || w.snow) && leftHome && !w.flags?.includes('moved_to_city')) return false;
  if (w.region && !w.region.includes(regionOf(p.pref))) return false;
  if (w.prefs && !w.prefs.includes(p.pref)) return false;
  if (w.snow !== undefined && w.snow !== SNOW_PREFS.has(p.pref)) return false;
  return true;
}

/** 差し込みを埋める。埋められないときは null（その場面は選ばない） */
function fill(p: Person, d: DailyItem, ctx: DailyCtx, rng: Rng): string | null {
  const y = ctx.year;
  let child: { name?: string; birthYear: number } | undefined;
  const need = (k: string) => d.text.includes(`{${k}}`);
  if (need('child') || need('childAge')) {
    const kids = p.children.filter((c) => c.alive && c.name && childAgeOf(c, y) >= 0);
    const ca = d.when?.childAge;
    const fit = ca ? kids.filter((c) => childAgeOf(c, y) >= ca[0] && childAgeOf(c, y) <= ca[1]) : kids;
    if (!fit.length) return null;
    child = rng.pick(fit);
  }
  const v: Record<(typeof SLOTS)[number], string | null> = {
    name: p.name.split(' ')[1] ?? p.name,
    friend: p.friendName && !p.friendLost ? p.friendName : null,
    spouse: p.married && p.spouseAlive && p.spouseName ? p.spouseName : null,
    child: child?.name ?? null,
    childAge: child ? String(childAgeOf(child, y)) : null,
    sib: p.siblings > 1 ? sibLabel(p, rng) : null,
    pet: p.pet?.alive ? p.pet.name : null,
    pref: y < 1871 ? S.KUNI[p.pref - 1] : S.PREFS[p.pref - 1],
    mAge: p.motherAlive ? String(parentAge(p, 'm', y)) : null,
    fAge: p.fatherAlive ? String(parentAge(p, 'f', y)) : null,
  };
  let ok = true;
  const out = d.text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const val = (v as Record<string, string | null>)[k];
    if (val === undefined) return m;
    if (val === null) ok = false;
    return val ?? '';
  });
  return ok ? out : null;
}

function sibLabel(p: Person, rng: Rng): string {
  if (!p.sibLabel) {
    const older = p.birthOrder > 1;
    p.sibLabel = older ? (rng.chance(0.5) ? '兄' : '姉') : rng.chance(0.5) ? '弟' : '妹';
  }
  return p.sibLabel;
}

const isLocal = (d: DailyItem) => !!(d.when?.region || d.when?.prefs || d.when?.snow);

/**
 * 本文に出てくる物が世の中に広まった年の目安。時代を問わない場面として書いたものでも、
 * それより前の年には出さない（明治・大正の人に、家の電話や段ボールが出ないように）。年はおおよその目安
 */
const MODERN: [RegExp, number][] = [
  [/電話|受話器/, 1955],
  [/冷蔵庫|洗濯機|掃除機|炊飯器/, 1955],
  [/テレビ|画面越し/, 1955],
  [/段ボール|ビニール|プラスチック|ペットボトル|ラップ/, 1955],
  [/(?<![風糸水山荷八力汽馬電列滑歯])車[のでを]|運転|フロントガラス|駐車|ドライブ|助手席|マイカー|ガソリン/, 1960],
  [/学校|先生|授業|教科書|月謝/, 1872],
  [/汽車|鉄道|駅|線路/, 1872],
  [/郵便|切手|ポスト/, 1871],
  [/はがき|葉書|年賀状|暑中見舞い/, 1873],
  [/新聞/, 1871],
  [/写真/, 1870],
  [/人力車/, 1870],
  [/洋服|帽子|ボタン|ズボン/, 1872],
  [/牛乳/, 1870],
  [/(?<!フライ)パン(?!ツ|ダ)/, 1875],
  [/電灯|電気|電球|スイッチ/, 1890],
  [/電車|市電/, 1895],
  [/野球/, 1890],
  [/活動写真|映画/, 1897],
  [/自転車/, 1900],
  [/キャラメル/, 1914],
  [/ラジオ/, 1925],
  [/高校|中学校の|部活|塾|偏差値/, 1948],
  [/給食/, 1947],
  [/健康診断|体重計|人間ドック/, 1960],
  [/介護|デイサービス|ヘルパー|ケアマネ/, 1985],
  [/レシート|コンビニ|スーパー|自動販売機|自販機|ファミレス/, 1965],
  [/[一二三四五六七八九十百千]+万円|\d+万円|万円/, 1955],
  [/ボールペン|シャープペン|マジック/, 1960],
  [/プール/, 1960],
  [/新幹線|飛行機|空港/, 1964],
  [/アパート|マンション|団地/, 1956],
  [/残業|有給|定年|退職金|年金|ボーナス/, 1950],
  [/カープ|プロ野球|ナイター/, 1950],
  [/電子レンジ|エアコン|クーラー|冷房/, 1970],
  [/ガス台|ガスコンロ|給湯/, 1960],
  [/保育園|学童/, 1950],
  [/ランドセル/, 1950],
  [/デート|喫茶店で待ち合わせ/, 1950],
  [/扇風機/, 1950],
  [/動画|メール|パソコン|ネット|スマホ|携帯/, 1995],
  [/通帳|ATM|カード/, 1960],
  [/インスタント|カップ麺|レトルト/, 1960],
  [/成人式|二十歳の式/, 1948],
  [/老眼鏡|老人会|敬老/, 1950],
  [/フェリー|バス停|バスに/, 1950],
];
/**
 * 1890年より前（江戸・明治の初め）の人には、時代を決めていない場面のうち、近代以降の物や仕組みが出てくるものを出さない。
 * 時代を問わない場面は昭和以降の暮らしを思い浮かべて書いたものが多いため、広めに外す（江戸・明治の初めの場面は data/daily/era_edo.json などにある）
 */
const OLD_BAN = new RegExp(
  '学校|教室|授業|先生|担任|クラス|同級生|部活|部室|先輩|後輩|体育|運動会|遠足|修学旅行|宿題|テスト|試験|卒業|入学|制服|ランドセル|給食|夏休み|冬休み|春休み|小学|中学|高校|大学|受験|塾|教科書|ノート|鉛筆|消しゴム|作文|黒板|図書|校庭|校舎|下校|登校|通学|会社|職場|上司|同僚|部下|給料|月給|ボーナス|残業|出勤|通勤|社員|課長|部長|係長|定年|退職|年金|就職|面接|名刺|スーツ|ネクタイ|背広|電車|汽車|列車|駅|線路|鉄道|バス|タクシー|自転車|バイク|オートバイ|車|運転|ガソリン|信号|横断歩道|道路|アスファルト|舗装|飛行機|船旅|フェリー|電話|電気|電灯|電球|蛍光灯|スイッチ|コンセント|テレビ|ラジオ|レコード|カセット|CD|映画|写真|カメラ|アルバム|新聞|雑誌|漫画|マンガ|絵本|郵便|ポスト|切手|はがき|葉書|ガラス|窓ガラス|網戸|カーテン|ソファ|ベッド|ストーブ|こたつ|扇風機|冷蔵庫|洗濯機|掃除機|炊飯器|電子レンジ|ガス|水道|蛇口|シャワー|トイレ|風呂場の|浴槽|タオル|歯ブラシ|石けん|石鹸|ハンカチ|ティッシュ|毛糸|セーター|ジャンパー|コート|帽子|靴|スニーカー|サンダル|長靴|傘|洋服|ズボン|スカート|シャツ|パジャマ|ボタン|チャック|眼鏡|メガネ|時計|腕時計|カレンダー|ケーキ|チョコ|アイス|ソフトクリーム|ジュース|コーラ|サイダー|ラムネ|ビール|ワイン|ウイスキー|コーヒー|紅茶|牛乳|パン|バター|チーズ|カレー|ラーメン|ハンバーグ|オムライス|ケチャップ|マヨネーズ|ソース|弁当箱|缶|瓶|白熊|ちゃんぽん|餃子|焼肉|ジンギスカン|コロッケ|とんかつ|すき焼き|牛丼|店員|レジ|スーパー|デパート|百貨店|商店街|喫茶|レストラン|食堂|映画館|遊園地|動物園|公園|プール|銀行|病院|医院|薬局|交番|警察|役所|市役所|区役所|町役場|千円|万円|百円|十円|円玉|円札|お札|財布|トランプ|ボール|野球|サッカー|テニス|スキー|スケート|ゲーム|おもちゃ|人形|ぬいぐるみ|クレヨン|色鉛筆|シール|風船|誕生日|誕生会|クリスマス|バレンタイン|プレゼント|旅行|帰省|休日|日曜|土曜|週末|連休|夏期|ペン|紙袋|ビニール|段ボール|袋菓子|お菓子屋|アパート|マンション|団地|エレベーター|階段の|ベランダ|玄関のチャイム|インターホン|病院|入院|手術|注射|薬を飲|体温計|検査|健康診断|レントゲン|救急|歯医者|同窓会|成人式|結婚式|披露宴|新婚旅行|指輪|婚約|ハネムーン|仕事帰り|給料日|アルバイト|バイト|パート|ポケット|リュック|カバン|鞄|かばん|ランプ|マッチ|ろうそくの|懐中電灯|新幹線|空港|ホテル|旅館|観光|温泉旅行|テーブル|椅子|いす|机の引き出し|本棚|英語|算数|数学|理科|社会科|国語|音楽の|図工|花火大会|スポーツ|マラソン|選手|試合|大会|応援団',
);

/** 1890年より前に出さない言葉の続き（学校や会社の暮らし、近代の道具・福祉など） */
const OLD_BAN2 =
  /飼育係|学芸会|終業式|通知表|休み時間|昼休み|鉄棒|ブランコ|連絡帳|プリント|参観日|合唱|進路|学級委員|朝の会|PTA|参考書|ようちえん|幼稚園|学生|同期|でんしゃ|うんてん|契約|事務所|シャッター|工場|社長|報告書|新人|内示|転勤|昇進|肩書き|終電|進水式|造船所|旋盤|毛布|歯みがき粉|家具|換気扇|水槽|熱帯魚|ホース|灯油|ポリタンク|電卓|家計簿|ローン|容器|宅配便|健康食品|ホチキス|資料|広告|模型|手すり|ごみ出し|ごみ置き場|ごみ袋|回覧板|民生委員|区民農園|町内会|子ども会|公民館|バザー|業者|職員|施設|プリン|スプーン|リハビリ|整形外科|待合室|病室|専門家|窓口|地図帳|タイル|休みの日|休みの朝|長い休み|船の旅|恋人|絵手紙|東京|トマト|キャベツ|肉まん|豚まん|お好み焼き|焼きそば|焼きめし|明太子/;

function modernMin(text: string): number {
  let y = -Infinity;
  for (const [re, min] of MODERN) if (re.test(text) && min > y) y = min;
  return y;
}

/** 本文から分かる前提は、読み込みのときに1回だけ調べておく（毎年すべての場面を調べ直すと遅いため） */
interface Needs {
  work: boolean;
  school: boolean;
  univ: boolean;
  loan: boolean;
  newly: boolean;
  grand: boolean;
  grandma: boolean;
  grandpa: boolean;
  friend: boolean;
  local: boolean;
  minYear: number;
  oldBan: boolean;
  terako: boolean;
}
const NEEDS = new Map<DailyItem, Needs>();
function needsOf(d: DailyItem): Needs {
  let n = NEEDS.get(d);
  if (!n) {
    n = {
      work: needsWork(d),
      school: needsSchool(d),
      univ: needsUniv(d),
      loan: needsLoan(d),
      newly: NEWLYWED.test(d.text),
      grand: GRANDCHILD.test(d.text),
      grandma: SELF_GRANDMA.test(d.text),
      grandpa: SELF_GRANDPA.test(d.text),
      friend: d.text.includes('{friend}'),
      local: !!(d.when?.region || d.when?.prefs || d.when?.snow),
      minYear: modernMin(d.text),
      oldBan: d.yearMin === undefined && (OLD_BAN.test(d.text) || OLD_BAN2.test(d.text)),
      // 寺子屋に通った子の場面（通わなかったことを書いたものは除く）
      terako: /寺子屋|手習い|師匠|席書|素読/.test(d.text) && !/行かず|通わず|通えな|行けな/.test(d.text) && (d.yearMax ?? 9999) < 1890,
    };
    NEEDS.set(d, n);
  }
  return n;
}

function eligible(p: Person, d: DailyItem, ctx: DailyCtx): boolean {
  if (d.yearMin !== undefined && ctx.year < d.yearMin) return false;
  if (d.yearMax !== undefined && ctx.year > d.yearMax) return false;
  const n = needsOf(d);
  if (ctx.year < n.minYear && (d.yearMin === undefined || d.yearMin < n.minYear)) return false;
  if (ctx.year < 1890 && n.oldBan) return false;
  if (d.notBefore !== undefined && ctx.year < d.notBefore) return false;
  if (n.terako && p.flags.includes('no_school') && p.age < 15) return false;
  if (n.work && !working(p)) return false;
  if (n.school && p.age >= 15 && !['high', 'univ'].includes(schoolOf(p) ?? '')) return false;
  if (n.univ && schoolOf(p) !== 'univ') return false;
  if (n.loan && !p.flags.includes('student_loan')) return false;
  if (n.newly && !(p.marriageAge !== undefined && p.age - p.marriageAge <= 2 && p.married)) return false;
  if (n.grand && !p.children.some((c) => c.grandchild)) return false;
  if (n.grandma && p.sex !== 'female') return false;
  if (n.grandpa && p.sex !== 'male') return false;
  // 親友ができた年は、親友との別の場面を重ねない
  if (p.friendSince === p.age && n.friend) return false;
  const used = p.dailyUsed?.[d.id];
  // 時代を問わない土地の暮らし（祭り、雪、名物など）は、12年あければまた出てよい
  const gap = d.repeatGap ?? (n.local && d.yearMin === undefined && d.kind === 'daily' ? 12 : undefined);
  if (used !== undefined && (!gap || p.age - used < gap)) return false;
  return okWhen(p, d.when, ctx);
}

function weightOf(d: DailyItem, ctx: DailyCtx): number {
  let w = d.weight ?? 1;
  // 時代や境遇に結びついた場面を少し出やすくする（その人だけの暮らしに見えるように）
  if (d.yearMin !== undefined || d.yearMax !== undefined) w *= 1.6;
  if (d.when && Object.keys(d.when).length) w *= 1.3;
  if (d.when?.trigger && ctx.triggers.has(d.when.trigger)) w *= 6;
  // 県や地方に結びついた場面は、その土地の暮らしが見えるように出やすくする
  if (d.when?.prefs) w *= 7;
  else if (d.when?.region || d.when?.snow) w *= 4.5;
  return w;
}

function pickItems(p: Person, rng: Rng, ctx: DailyCtx, kind: 'daily' | 'think', n: number, onlyLocal = false): void {
  const pool = (BY_AGE[onlyLocal ? 'local' : kind][p.age] ?? []).filter((d) => eligible(p, d, ctx));
  for (let k = 0; k < n && pool.length; k++) {
    const d = rng.weighted(pool, pool.map((x) => weightOf(x, ctx)));
    pool.splice(pool.indexOf(d), 1);
    const text = fill(p, d, ctx, rng);
    if (text === null) {
      k--;
      continue;
    }
    (p.dailyUsed ??= {})[d.id] = p.age;
    ctx.log(kind, kind === 'think' ? '心の声' : '日々のこと', text);
    // 親友が引っ越した・転校した場面のあとは、疎遠になったものとして扱う（何十年かのちに再会することはある）
    if (d.text.includes('{friend}') && /引っ越|転校|遠くの町へ|離れ離れ/.test(d.text)) p.friendLost = p.age;
    if (d.effects) {
      const { health: _h, ...rest } = d.effects;
      ctx.applyEffects(rest);
    }
  }
}

// ---------- プログラムで作る場面 ----------

const PET_NAMES: { from: number; dog: string[]; cat: string[] }[] = [
  { from: 1790, dog: ['シロ', 'クロ', 'アカ', 'ブチ'], cat: ['タマ', 'ミケ', 'トラ', 'クロ'] },
  { from: 1900, dog: ['ポチ', 'シロ', 'クロ', 'ジョン'], cat: ['タマ', 'ミケ', 'トラ', 'クロ'] },
  { from: 1965, dog: ['チビ', 'ハチ', 'コロ', 'ラッキー'], cat: ['ミー', 'タマ', 'チャー', 'ミミ'] },
  { from: 1990, dog: ['モモ', 'ココ', 'チョコ', 'マロン'], cat: ['モモ', 'ソラ', 'レオ', 'ルナ'] },
];

function petName(rng: Rng, year: number, kind: 'dog' | 'cat'): string {
  let bin = PET_NAMES[0];
  for (const b of PET_NAMES) if (year >= b.from) bin = b;
  return rng.pick(bin[kind]);
}

function survivalShare(p: Person): number {
  let s = 1;
  for (let a = 0; a < p.age; a++) s *= 1 - S.qx(p.birthYear + a, a, p.sex);
  return s;
}

const SAME_SEX = (p: Person) => (p.age < 20 ? (p.sex === 'male' ? '男の子' : '女の子') : p.sex === 'male' ? '男性' : '女性');

function storyBeats(p: Person, rng: Rng, ctx: DailyCtx): void {
  const a = p.age;
  const y = ctx.year;

  // 親友ができる
  if (!p.friendName && a >= 6 && a <= 10 && rng.chance(a === 6 ? 0.5 : 0.3)) {
    p.friendName = otherName(p, rng, p.birthYear + rng.int(-1, 1), rng.chance(0.85) ? p.sex : p.sex === 'male' ? 'female' : 'male');
    p.friendSince = a;
    const f = p.friendName;
    ctx.log(
      'daily',
      '親友',
      rng.pick(
        y < 1873
          ? [
              `${p.inSchool !== null ? '寺子屋で隣に座った' : '近所の'}${f}と、帰り道に川で小魚をすくった。それから毎日いっしょに遊ぶようになった。`,
              `${f}が、拾った栗を半分に分けてくれた。その日から${f}とは大の仲良しになった。`,
              `近所の${f}と、日が暮れるまで鬼ごっこをした。次の日も、その次の日も遊んだ。`,
            ]
          : [
              `同じ組の${f}と、帰り道が同じだと分かった。それから毎日いっしょに帰るようになった。`,
              y < 1910 ? `${f}が、石板に書いた字をほめてくれた。その日から${f}とは大の仲良しになった。` : `${f}が、消しゴムを半分に切って分けてくれた。その日から${f}とは大の仲良しになった。`,
              `近所に越してきた${f}と、日が暮れるまで遊んだ。次の日も、その次の日も遊んだ。`,
            ],
      ),
    );
  }
  // 親友と疎遠になる
  if (p.friendName && !p.friendLost && a >= 16 && a <= 26 && rng.chance(0.06)) {
    p.friendLost = a;
    ctx.log('daily', '親友', rng.pick([`${p.friendName}とは、いつの間にか連絡を取らなくなっていた。けんかをしたわけではなかった。`, `${p.friendName}が遠くの町へ行った。最初のうちは手紙を書いたが、だんだん間があいた。`]));
  }
  // 再会
  if (p.friendName && p.friendLost && a >= 40 && a <= 75 && rng.chance(0.04)) {
    const gap = a - p.friendLost;
    p.friendLost = undefined;
    ctx.log('daily', '再会', `${y < 1920 ? '村の祭りの日に' : '同窓会で'}、${p.friendName}と${gap}年ぶりに会った。顔を見たとたん、子どものころの呼び方で呼び合っていた。`, { star: true });
  }

  // 結婚記念日
  if (p.married && p.spouseAlive && p.marriageAge !== undefined && p.spouseName) {
    const yrs = a - p.marriageAge;
    if (yrs === 10) ctx.log('daily', '結婚10年', y < 1920 ? `結婚して10年。${p.spouseName}と、久しぶりに二人で寺社に参った。` : `結婚して10年。${p.spouseName}と、いつもより少しだけいい店で夕食をとった。`);
    if (yrs === 25 && y >= 1930) ctx.log('daily', '銀婚式', `結婚して25年の銀婚式。${p.spouseName}と、結婚したころの写真を出してきて、二人で笑った。`);
    if (yrs === 40) ctx.log('daily', y < 1950 ? '結婚40年' : 'ルビー婚', `結婚して40年。気がつけば、${p.spouseName}と暮らした年月のほうが、ひとりで生きた年月より長くなっていた。`);
    if (yrs === 50) ctx.log('daily', y < 1930 ? '結婚50年' : '金婚式', y < 1930 ? `結婚して50年。子や孫が集まって、${p.spouseName}と二人の長寿を祝ってくれた。` : `結婚して50年の金婚式。子や孫が集まって、${p.spouseName}と並んで写真を撮った。`, { star: true });
  }

  // 子どもの節目
  for (const c of p.children) {
    if (!c.alive || !c.name) continue;
    const ca = y - c.birthYear;
    if (ca === 6)
      ctx.log(
        'daily',
        `${c.name}の${y < 1873 ? '手習い' : '入学'}`,
        y < 1873 ? `${c.name}が手習いを始めた。小さな手で筆を握り、いろはを一字ずつ書いていた。` : y < 1950 ? `${c.name}が小学校に入った。新しい着物を着て、うれしそうに出かけていった。` : `${c.name}が小学校に入った。大きなランドセルが、歩くたびに背中で揺れていた。`,
      );
    if (ca === 20) ctx.log('daily', `${c.name}が二十歳に`, y < 1948 ? `${c.name}が二十歳になった。すっかり大人の顔つきになったのを見て、生まれた日のことを思い出した。` : `${c.name}が二十歳になった。${y >= 2023 ? '二十歳を祝う式' : '成人式'}の朝、晴れ着の姿を見て、生まれた日のことを思い出した。`);
    if (ca >= (y < 1930 ? 18 : 27) && ca <= 34 && !c.married && rng.chance(0.09)) {
      c.married = true;
      ctx.log('daily', `${c.name}の結婚`, y < 1950 ? `${c.name}の祝言（結婚の祝い）があった。親類が集まり、夜遅くまでにぎやかだった。` : `${c.name}が結婚した。式の最後の手紙で、思いがけず泣いてしまった。`, { star: true });
    }
    if (c.married && !c.grandchild && rng.chance(0.15)) {
      c.grandchild = true;
      ctx.log('daily', '孫', `${c.name}に子どもが生まれた。初めて抱いた孫は、思っていたよりずっと軽かった。`, { star: true });
      ctx.applyEffects({ happiness: 6 });
    }
  }

  // ペット
  if (!p.pet && a >= 7 && a <= 65 && rng.chance(0.025)) {
    const kind = rng.chance(0.55) ? 'dog' : 'cat';
    p.pet = { name: petName(rng, y, kind), kind, since: a, alive: true };
    const label = kind === 'dog' ? '犬' : '猫';
    ctx.log('daily', `${label}の${p.pet.name}`, kind === 'dog' ? `${label}を飼い始めた。名前は${p.pet.name}。毎朝、${y < 1920 ? '戸口' : '玄関'}で待つようになった。` : `${label}が家に来た。名前は${p.pet.name}。${y < 1900 ? '日なたの縁側で、いつも丸くなっていた。' : '新聞を広げると、必ずその上に座った。'}`);
    ctx.applyEffects({ happiness: 4 });
  } else if (p.pet?.alive && a - p.pet.since >= 12 && rng.chance(0.25)) {
    p.pet.alive = false;
    ctx.log('daily', `${p.pet.name}との別れ`, `${p.pet.name}を見送った。${a - p.pet.since}年いっしょに暮らした。しばらくは、玄関の音がするたびに振り向いた。`);
    ctx.applyEffects({ happiness: -5 });
  }

  // 生存割合の節目（このゲームの生命表から計算）
  if (a > 0 && a % 10 === 0) {
    const share = survivalShare(p);
    ctx.log('daily', `${a}歳`, `${a}歳になった。${p.birthYear}年に生まれた${SAME_SEX(p)}のうち、いまも生きているのは約${Math.round(share * 100)}%。`, { source: '生命表から計算（data/stats/mortality.json）' });
  }

  // 回想：叶わなかった望みと、昔の決断や大きな節目
  if (a >= 45 && rng.chance(0.08)) {
    const wish = p.wishes.find((w) => !w.ok && w.age <= a - 15 && !p.dailyUsed?.[`wish:${w.wish}`]);
    if (wish && rng.chance(0.5)) {
      (p.dailyUsed ??= {})[`wish:${wish.wish}`] = a;
      ctx.log('think', '心の声', rng.pick([`「${wish.age}歳のとき、${wish.wish}が叶っていたら。どんな暮らしになっていただろう」`, `「${wish.wish}のことは、もう考えないと決めた。それでも、ときどき思い出す」`]));
    } else {
      const past = p.log.filter((e) => e.age <= a - 20 && !e.heavy && (e.kind === 'decision' || e.star || (e.kind === 'family' && /結婚|生まれた/.test(e.title))));
      if (past.length) {
        const e = rng.pick(past);
        const first = e.text.split('。')[0];
        if (first && first.length <= 40) ctx.log('daily', '思い出す', `ふと、${e.age}歳のころのことを思い出した。${first}。`);
      }
    }
  }
}

/** 1年分の日常と心の声 */
export function dailyLife(p: Person, rng: Rng, ctx: DailyCtx): void {
  if (!p.alive) return;
  storyBeats(p, rng, ctx);
  const a = p.age;
  let n = a <= 2 ? 1 : rng.chance(0.35) ? 3 : 2;
  // その土地の暮らしが見えるように、毎年3割ほどは、県や地方の場面を先に1つ選ぶ
  if (a >= 3 && rng.chance(0.32)) {
    const before = p.log.length;
    pickItems(p, rng, ctx, 'daily', 1, true);
    if (p.log.length > before) n -= 1;
  }
  pickItems(p, rng, ctx, 'daily', n);
  const thinkProb = ctx.triggers.size ? 0.9 : a < 4 ? 0.15 : 0.55;
  if (rng.chance(thinkProb)) pickItems(p, rng, ctx, 'think', 1);
}

/** 名前を付ける（配偶者・子） */
export function nameSpouse(p: Person, rng: Rng): string {
  const sp = otherName(p, rng, p.birthYear + (p.sex === 'male' ? rng.int(0, 4) : -rng.int(0, 4)), p.sex === 'male' ? 'female' : 'male');
  p.spouseName = sp;
  return sp;
}

export function nameChild(p: Person, rng: Rng, year: number, sex: 'male' | 'female'): string {
  return otherName(p, rng, year, sex);
}

/** 親友・配偶者・子の名前。3人の主人公や、身近な人と同じ名前にはしない（誰の話か分からなくなるため） */
function otherName(p: Person, rng: Rng, year: number, sex: 'male' | 'female'): string {
  const taken = new Set([...(p.reservedNames ?? []), p.name.split(' ')[1], p.friendName, p.spouseName, ...p.children.map((c) => c.name)]);
  let n = pickGivenName(rng, year, sex);
  for (let k = 0; k < 20 && taken.has(n); k++) n = pickGivenName(rng, year + rng.int(-6, 6), sex);
  return n;
}
