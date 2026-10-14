// シミュレーションで使う型。データ形式は docs/04_素材カタログ.md と data/stats/*.json に合わせる。

export type Sex = 'male' | 'female';
export type Edu = 'none' | 'middle' | 'high' | 'junior' | 'univ';
export type Job = 'farm' | 'self' | 'smallco' | 'bigco' | 'public' | 'none';
export type EraId = 0 | 1 | 2; // 0: 1930〜45年生まれ、1: 1960〜75年生まれ、2: 1990〜2005年生まれ

export interface Effects {
  health?: number;
  happiness?: number;
  knowledge?: number;
  relation?: number;
  money?: number;
  flags?: string[];
  death?: { prob: number; cause: string };
}

export interface EventConditions {
  education?: Edu[];
  job?: Job[];
  married?: boolean;
  familyClass?: number[];
  flags?: string[];
  notFlags?: string[];
}

export interface GameEvent {
  id: string;
  key?: string;
  category: string;
  year: number;
  endYear?: number;
  month?: number;
  prefs?: number[];
  ageMin: number;
  ageMax: number;
  sex?: 'any' | Sex;
  conditions?: EventConditions;
  title: string;
  text: string;
  effects?: Effects;
  probability: number;
  heavy?: boolean;
  source?: { title?: string; url?: string; verified?: boolean };
  probNote?: string;
}

export type LogKind =
  | 'birth'
  | 'event'
  | 'decision'
  | 'school'
  | 'work'
  | 'family'
  | 'money'
  | 'health'
  | 'death'
  | 'wish' // 望んだが叶わなかった
  | 'pension'
  | 'note' // プレイヤーが残した思い
  | 'daily' // 日々のこと（docs/07）
  | 'think'; // 心の声

export interface LogEntry {
  age: number;
  year: number;
  kind: LogKind;
  title: string;
  text: string;
  heavy?: boolean;
  star?: boolean;
  category?: string;
  source?: string;
}

export interface Child {
  birthYear: number;
  sex: Sex;
  alive: boolean;
  name?: string;
  married?: boolean;
  grandchild?: boolean;
}

export interface Stats4 {
  health: number;
  happiness: number;
  knowledge: number;
  relation: number;
}

/** 3人に共通の生まれつきのもの */
export interface Shared {
  seed: number;
  pref: number; // 1〜47
  sex: Sex;
  familyClass: number; // 1〜5
  talent: string; // 才能（生まれつき）
  temperament: string | null; // 気質（2〜5歳の選択で決まる）
  firstName: string; // 3人で同じ名前の読みにはしない。時代ごとに名前は変わる
  playerBirthYear: number | null;
}

export interface Person {
  era: EraId;
  birthYear: number;
  birthMonth: number;
  name: string;
  sex: Sex;
  pref: number;
  familyClass: number;
  parentJob: Job;
  birthOrder: number;
  siblings: number;
  fatherBirthYear: number;
  motherBirthYear: number;
  fatherAlive: boolean;
  motherAlive: boolean;

  age: number;
  alive: boolean;
  deathAge?: number;
  deathYear?: number;
  deathCause?: string;

  stats: Stats4;
  money: number; // 純資産（当時の円）
  income: number; // 今年の年収（当時の円）
  lifetimeEarnings: number; // 生涯年収（名目の合計、円）
  lifetimeEarningsReal: number; // 2020年の価値に直した合計（円）

  edu: Edu;
  inSchool: Edu | null;
  job: Job | null;
  jobTitle: string;
  workYears: number;
  retired: boolean;
  movedToCity: boolean;

  married: boolean;
  marriageAge?: number;
  marriageType?: '見合い' | '恋愛' | 'ネット' | '職場';
  spouseAlive: boolean;
  children: Child[];
  wantChildren: number;

  pensionStartAge?: number;
  pensionMonthly?: number; // 受給開始時の月額（当時の円）
  pensionMonthlyReal?: number; // 2020年の価値
  pensionRange?: [number, number]; // 未来の人だけ：悲観〜楽観（2020年の価値）

  flags: string[];
  usedKeys: string[];

  // 日常（docs/07）
  friendName?: string;
  friendSince?: number;
  friendLost?: number; // 疎遠になった年齢
  spouseName?: string;
  pet?: { name: string; kind: 'dog' | 'cat'; since: number; alive: boolean };
  sibLabel?: string;
  reservedNames?: string[]; // 3人の主人公の名。身近な人の名前に使わない
  dailyUsed?: Record<string, number>;
  log: LogEntry[];
  bestYear: { age: number; year: number; happiness: number };
  happinessByAge: number[];
  wishes: { age: number; wish: string; result: string; ok: boolean }[];
}

export interface DecisionOption {
  id: string;
  label: string;
  /** 3人それぞれについて、選べるかどうかと理由 */
  availability: { ok: boolean; reason?: string }[];
  hint?: string;
}

export interface DecisionView {
  id: string;
  age: number;
  title: string;
  prompt: string;
  /** 3人それぞれの時代の根拠になる統計 */
  evidence: string[];
  options: DecisionOption[];
}

export interface DecisionResult {
  title: string;
  /** 3人それぞれの結果。亡くなっている人は null */
  results: ({ ok: boolean; text: string } | null)[];
}

export interface ScheduledItem {
  t: number; // 0〜1、年の中のどこで起きるか
  kind: 'event' | 'decision' | 'tick' | 'death';
  personIndex?: number;
  payload?: unknown;
}
