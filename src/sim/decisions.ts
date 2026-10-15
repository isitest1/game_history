// 決断。プレイヤーが1回選ぶと、3人全員に当てはまる。
// 選んだことは「本人が望んだこと」。叶うかどうかは、その時代の統計と家の事情で決まる。
// 選べない選択肢は、理由を付けて表示する。
//
// 数字の出典は data/stats/*.json（stats.ts 経由）。文章の中の固有の事実は、docs/出典一覧.md の「決断の文章」に出典を書く。
// 「目安」と書いた確率は統計からの直接の値ではない。

import { Rng } from './rng';
import * as S from './stats';
import { EDU_LABEL, findJob, isEdo, jobLabelAt, jobWishLabel, log, man, moneyAt, startWork, yearOf, type GameState } from './engine';
import type { DecisionResult, DecisionView, Job, Person } from './types';

type Avail = { ok: boolean; reason?: string };
type Outcome = { ok: boolean; text: string };

interface OptionDef {
  id: string;
  label: string;
  hint?: string;
  available?: (p: Person, st: GameState) => Avail;
}

interface DecisionDef {
  id: string;
  age: number;
  title: string;
  prompt: string;
  /** 聞くかどうか（生きている人のうち誰かに関係があるとき） */
  applies?: (st: GameState) => boolean;
  /** その人に関係があるか。関係がない人は結果に「関係なし」と出す */
  relevant?: (p: Person, st: GameState) => boolean;
  evidence: (p: Person, st: GameState) => string;
  options: OptionDef[];
  resolve: (p: Person, opt: string, st: GameState, rng: Rng) => Outcome;
  auto?: (st: GameState, rng: Rng) => string;
}

const pct = (x: number) => `${Math.round(x)}%`;
const pct1 = (x: number) => `${x.toFixed(1)}%`;
const sexWord = (p: Person) => (p.sex === 'male' ? '男子' : '女子');
const famAdj = (p: Person) => [-1.0, -0.5, 0, 0.45, 0.9][p.familyClass - 1];
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(Math.max(1e-4, Math.min(1 - 1e-4, p)) / (1 - Math.max(1e-4, Math.min(1 - 1e-4, p))));
/** 望んだ人が叶う確率：その年の割合に、家の事情と学力を足す */
function wishProb(rate: number, p: Person, bonus = 0.8): number {
  const know = (p.stats.knowledge - 50) / 25;
  return logistic(logit(rate) + famAdj(p) + know * 0.5 + bonus);
}

function entranceExam(year: number): string {
  if (year < 1979) return '各大学の入試';
  if (year <= 1989) return '共通一次試験';
  if (year <= 2020) return '大学入試センター試験';
  return '大学入学共通テスト';
}

const OKINAWA_US = (p: Person, year: number) => p.pref === 47 && year >= 1945 && year < 1972;

/**
 * プレイヤーに聞く決断。人生の分かれ道になり、時代によって結果がはっきり変わるものだけ（2026-10-15、ユーザーの指摘「質問が多すぎる」で21から10に減らした）。
 * ほかの決断は、聞かずに自動で決め、記録にだけ残す
 */
export const ASKED = new Set(['middle', 'high', 'college', 'marriage', 'city', 'children', 'workfamily', 'house', 'care', 'retire']);

export const DECISIONS: DecisionDef[] = [
  // 1. 気質
  {
    id: 'temperament',
    age: 3,
    title: 'いちばん好きな遊び',
    prompt: '3歳。小さいころ、いちばん好きだったのは？　選んだことが、3人に共通の気質になる。',
    evidence: (p) => `${yearOf(p)}年、${S.placeName(p.pref, yearOf(p))}。${p.siblings}人きょうだいの${p.birthOrder === 1 ? '上' : p.birthOrder === p.siblings ? '末っ子' : '真ん中'}。`,
    options: [
      { id: 'active', label: '外を走り回る' },
      { id: 'books', label: '絵本や図鑑を眺める' },
      { id: 'people', label: '大人や友だちと話す' },
      { id: 'alone', label: 'ひとりで何かを作る' },
    ],
    resolve: (p, opt, st) => {
      const label = { active: '活発', books: '好奇心が強い', people: '人なつこい', alone: '凝り性' }[opt] ?? '';
      st.shared.temperament = label;
      const eff = { active: { health: 6 }, books: { knowledge: 6 }, people: { relation: 6 }, alone: { happiness: 4, knowledge: 3 } }[opt] ?? {};
      Object.entries(eff).forEach(([k, v]) => ((p.stats as any)[k] = Math.min(100, (p.stats as any)[k] + v)));
      const y = yearOf(p);
      const scene =
        y < 1946
          ? opt === 'active'
            ? '路地や田んぼのあぜ道を走り回った。'
            : opt === 'books'
              ? '絵本は貴重で、同じ本を何度もめくった。'
              : opt === 'people'
                ? '近所の大人によく話しかけた。'
                : '木切れや紙で、何かを作っていた。'
          : y < 2000
            ? opt === 'active'
              ? '公園や空き地を走り回った。'
              : opt === 'books'
                ? '図鑑を開くと、時間を忘れた。'
                : opt === 'people'
                  ? '誰とでもすぐに仲良くなった。'
                  : 'ブロックで何かを作り続けた。'
            : opt === 'active'
              ? '公園を走り回った。'
              : opt === 'books'
                ? '絵本や図鑑、ときどきタブレットの動画も見た。'
                : opt === 'people'
                  ? '保育園で、誰とでもすぐに仲良くなった。'
                  : 'ブロックで何かを作り続けた。';
      return { ok: true, text: `${scene}気質は「${label}」になった。` };
    },
    auto: (_st, rng) => rng.pick(['active', 'books', 'people', 'alone']),
  },
  // 2. 習い事
  {
    id: 'lessons',
    age: 8,
    title: '習い事',
    prompt: '8歳。何か習いたい？',
    evidence: (p) => `${yearOf(p)}年。家の暮らし向きは5段階の${p.familyClass}。`,
    options: [
      {
        id: 'piano',
        label: 'ピアノ',
        available: (p) => (yearOf(p) < 1900 ? { ok: false, reason: 'ピアノは、日本にはまだほとんどなかった' } : yearOf(p) < 1955 && p.familyClass < 5 ? { ok: false, reason: 'ピアノを置ける家は、ごく限られていた' } : { ok: true }),
      },
      { id: 'soroban', label: 'そろばん・習字' },
      { id: 'juku', label: '学習塾' },
      { id: 'none', label: '習わない（外で遊ぶ）' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      const war = y >= 1941 && y <= 1945;
      const postwar = y >= 1946 && y <= 1948;
      if (opt === 'none') {
        p.stats.happiness = Math.min(100, p.stats.happiness + 4);
        return { ok: true, text: war || postwar ? '習い事どころではなかった。' : '放課後は外で遊んだ。' };
      }
      if (war) return { ok: false, text: '戦争中で、習い事どころではなかった。' };
      if (postwar) return { ok: false, text: '戦争が終わったばかりで、食べるものにも困っていた。習い事どころではなかった。' };
      // ピアノ：1960〜70年代にピアノの家庭への普及が進んだ（目安）
      const base = opt === 'piano' ? (y < 1955 ? 0.05 : y < 1975 ? 0.35 : 0.5) : opt === 'juku' ? (y < 1960 ? 0.15 : y < 1975 ? 0.4 : 0.6) : y < 1960 ? 0.5 : 0.6;
      const ok = rng.chance(Math.min(0.95, base * (0.6 + p.familyClass * 0.15)));
      if (!ok) {
        p.wishes.push({ age: p.age, wish: { piano: 'ピアノ', soroban: 'そろばん', juku: '塾' }[opt] ?? opt, result: '習えなかった', ok: false });
        return { ok: false, text: '習いたかったが、家にその余裕はなかった。' };
      }
      p.stats.knowledge = Math.min(100, p.stats.knowledge + (opt === 'juku' ? 6 : 3));
      p.flags.push(`lesson_${opt}`);
      if (y < 1890) return { ok: true, text: opt === 'juku' ? '漢学の私塾に通い、四書五経（儒学の書物）の素読を習った。' : 'そろばんと習字の稽古に通った。' };
      const t = {
        piano: y < 1975 ? '近所の先生の家にピアノを習いに通った。クラスでピアノを習うのは、まだ少数だった。' : 'ピアノ教室に通い始めた。',
        soroban: 'そろばん教室に通った。',
        juku: y < 1965 ? '近所の塾に通い始めた。まだ塾に通う子は多くなかった。' : y < 2000 ? '駅前の学習塾に通い始めた。' : '学習塾に通い始めた。オンラインの授業もあった。',
      }[opt]!;
      return { ok: true, text: t };
    },
    auto: (_st, rng) => rng.pick(['piano', 'soroban', 'juku', 'none']),
  },
  // 3. 中学受験
  {
    id: 'middle',
    age: 12,
    title: '中学校',
    prompt: '12歳。受験して、上の学校をめざす？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1873) return `${y}年。上の学校にあたるのは、藩校（武士の子の学校）や郷学・私塾。${p.flags.includes('samurai_family') ? '武士の子なので、藩校に通うことになっている。' : '百姓や町人の子は、寺子屋を終えると働くのがふつうだった。'}`;
      if (y < 1947) return `${y}年は旧制の学校制度。旧制中学・高等女学校などへ進んだのは、${sexWord(p)}の${pct(S.eduRate('highSchool', y, p.sex))}（目安）。`;
      return `${y}年。新しい中学校（1947年から義務教育）。私立・国立の中学へ進む子は少数。`;
    },
    options: [
      { id: 'exam', label: '受験して上の学校へ行きたい' },
      { id: 'local', label: '近くの学校でいい' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      if (y < 1873) {
        // 江戸：武士の子は藩校へ。百姓・町人の子は、私塾や郷学で学び続けるのは少数（目安）
        if (p.flags.includes('samurai_family')) {
          p.flags.push('elite_middle');
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 6);
          return { ok: true, text: opt === 'exam' ? '藩校に通い、漢学と武芸を学んだ。' : '藩校に通い始めた。武士の子は、藩校で学ぶ決まりだった。' };
        }
        if (opt === 'local') return { ok: true, text: '寺子屋を終え、家の仕事を手伝い始めた。' };
        if (p.inSchool === null) {
          p.wishes.push({ age: 12, wish: '学問を続けること', result: '働いた', ok: false });
          return { ok: false, text: '学問がしたかったが、手習いも受けていなかった。家の仕事を手伝った。' };
        }
        const ok = rng.chance(wishProb(Math.max(0.02, S.eduRate('highSchool', y, p.sex) / 100), p, 0.4));
        if (ok) {
          p.flags.push('elite_middle');
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 6);
          return { ok: true, text: '村の郷学（庶民も学べる学校）や私塾に通い、学問を続けた。' };
        }
        p.wishes.push({ age: 12, wish: '学問を続けること', result: '家の仕事', ok: false });
        return { ok: false, text: '学問を続けたかったが、家の仕事の手が足りなかった。寺子屋を終えて働き始めた。' };
      }
      if (opt === 'local') {
        return { ok: true, text: y < 1886 ? '小学校の上の課程に進んだ。' : y < 1941 ? '高等小学校に進んだ。' : y < 1947 ? '国民学校の高等科に進んだ。' : '地元の公立中学に進んだ。' };
      }
      if (y < 1947) {
        const ok = rng.chance(wishProb(S.eduRate('highSchool', y, p.sex) / 100, p));
        if (ok) {
          p.flags.push('elite_middle');
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 8);
          return { ok: true, text: `${p.sex === 'male' ? '旧制中学' : '高等女学校'}に合格した。` };
        }
        p.wishes.push({ age: 12, wish: '旧制中学への進学', result: y < 1941 ? '高等小学校' : '国民学校高等科', ok: false });
        return { ok: false, text: `${p.sex === 'male' ? '旧制中学' : '高等女学校'}に行きたかったが、家の事情で${y < 1886 ? '小学校の上の課程' : y < 1941 ? '高等小学校' : '国民学校の高等科'}に進んだ。` };
      }
      // 私立・国立中学の割合（目安。都市部ほど高い）
      const metro = S.METRO.has(p.pref);
      const base = (metro ? (y < 1980 ? 0.06 : y < 2000 ? 0.12 : 0.18) : y < 1990 ? 0.02 : 0.05) * 3;
      const ok = rng.chance(Math.min(0.9, base * (0.4 + p.familyClass * 0.25) * (0.6 + p.stats.knowledge / 100)));
      if (ok) {
        p.flags.push('elite_middle');
        p.stats.knowledge = Math.min(100, p.stats.knowledge + 6);
        return { ok: true, text: y < 1975 ? '国立大学の附属中学に合格した。' : '受験して、私立の中高一貫校に入った。' };
      }
      p.wishes.push({ age: 12, wish: '中学受験', result: '公立中学', ok: false });
      return { ok: false, text: !metro ? '近くに受験できる中学がなく、地元の公立中学に進んだ。' : '受験したが届かず、地元の公立中学に進んだ。' };
    },
    auto: (_st, rng) => (rng.chance(0.3) ? 'exam' : 'local'),
  },
  // 4. 働き方の夢
  {
    id: 'dream',
    age: 14,
    title: '将来の夢',
    prompt: '14歳。大人になったら、どんなふうに働きたい？　学校を出たときに、この夢をめざす。',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1890) return `${y}年。働く人の約${pct(S.primaryShare(y))}が農業。${isEdo(y) ? '大きな会社＝大店への奉公、公務員＝武士、と読み替える。' : '大きな会社＝大きな商家や会社、公務員＝役人、と読み替える。'}家は${jobLabelAt(p.parentJob, p.birthYear)}。`;
      return `${y}年。就業者のうち農林漁業は${pct(S.primaryShare(y))}、雇われて働く人は${pct(S.employeeShare(y))}。親は${({ farm: '農家', self: '自営業', smallco: '中小企業の勤め', bigco: '大企業の勤め', public: '公務員', none: '無職' } as Record<Job, string>)[p.parentJob]}。`;
    },
    options: [
      { id: 'bigco', label: '大きな会社に勤めたい' },
      { id: 'public', label: '公務員になりたい' },
      { id: 'self', label: '自分の店や商売を持ちたい' },
      { id: 'farm', label: '家の仕事を継ぎたい', available: (p) => (p.parentJob === 'farm' || p.parentJob === 'self' ? { ok: true } : { ok: false, reason: '継ぐ家業がない' }) },
      { id: 'city', label: '都会に出て働きたい', available: (p) => (S.METRO.has(p.pref) ? { ok: false, reason: 'もう都会に住んでいる' } : { ok: true }) },
    ],
    resolve: (p, opt, st) => {
      st.prefs.jobWish = (opt === 'farm' && p.parentJob === 'self' ? 'self' : opt) as Job | 'city';
      return { ok: true, text: `「${jobWishLabel(st.prefs.jobWish, yearOf(p))}」を夢にした。` };
    },
    auto: (_st, rng) => rng.pick(['bigco', 'public', 'self', 'city']),
  },
  // 5. 高校
  {
    id: 'high',
    age: 15,
    title: '中学を出たら',
    prompt: '15歳。中学を出たら、どうしたい？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1873) return `${y}年。高校にあたるのは、藩校や私塾で学問を続けること（目安で${sexWord(p)}の${pct(S.eduRate('highSchool', y, p.sex))}）。ほとんどの子は奉公に出るか、家の仕事を手伝った。`;
      if (y < 1890) return `${y}年。中学校に進むのは、${sexWord(p)}の${pct(S.eduRate('highSchool', y, p.sex))}（目安）。多くの子は小学校を終えると働いた。`;
      return `${y}年の${y < 1948 ? '中学校・高等女学校への進学率' : '高校進学率'}は${sexWord(p)}${pct(S.eduRate('highSchool', y, p.sex))}。${S.newGradRatio('middle', y) !== undefined ? `中卒の就職は求人倍率${S.newGradRatio('middle', y)!.toFixed(1)}倍。` : y >= 1963 ? `中卒の就職は有効求人倍率${S.jobOpenings(y).toFixed(2)}倍。` : ''}`;
    },
    options: [
      { id: 'go', label: '高校に行きたい' },
      { id: 'work', label: '働きたい' },
    ],
    resolve: (p, opt, st, rng) => {
      const y = yearOf(p);
      // 小学校（寺子屋）に通えなかった人は、学歴を「通っていない」のままにする
      if (!p.flags.includes('no_school')) p.edu = 'middle';
      const rate = S.eduRate('highSchool', y, p.sex) / 100;
      const school = y < 1873 ? (p.flags.includes('samurai_family') ? '藩校' : '私塾') : y < 1886 ? (p.sex === 'male' ? '中学校' : '女学校') : y < 1948 ? (p.sex === 'male' ? '旧制中学' : '高等女学校') : '高校';
      if (y < 1873 && opt === 'go' && p.sex === 'female') {
        // 江戸の女子：学問を続ける場はごく少ない。裁縫や行儀の稽古（目安）
        if (rng.chance(0.15 + p.familyClass * 0.05)) {
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 3);
          p.flags.push('lesson_sewing');
          findJob(st, p, rng, y, 'middle');
          return { ok: true, text: '裁縫や行儀の稽古に通いながら、家の仕事を手伝った。女の子が学問を続ける場は、ごく少なかった。' };
        }
        p.wishes.push({ age: 15, wish: '学問を続けること', result: '働いた', ok: false });
        findJob(st, p, rng, y, 'middle');
        return { ok: false, text: '学問を続けたかったが、女の子が学ぶ場は、ほとんどなかった。' };
      }
      if (opt === 'go') {
        // ほとんど全員が進学する時代は、望めばほぼ進める（定時制・通信制も含む）
        const prob = p.flags.includes('elite_middle') ? 0.97 : Math.max(wishProb(rate, p), rate > 0.95 ? 0.995 : 0);
        if (rng.chance(prob)) {
          p.inSchool = 'high';
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 5);
          const note = y < 1873 ? `同じ年の${sexWord(p)}で、藩校や私塾で学び続けたのは約${pct(rate * 100)}（推計）だった。` : rate < 0.6 ? `同じ年の${sexWord(p)}で${school}に進んだのは${pct(rate * 100)}だった。` : rate > 0.9 ? 'ほとんどの同級生が高校に進んだ。' : '';
          return { ok: true, text: `${school}に進んだ。${note}` };
        }
        p.wishes.push({ age: 15, wish: y < 1873 ? '学問を続けること' : '高校進学', result: y < 1873 ? '奉公や家の仕事' : '中学を出て就職', ok: false });
        findJob(st, p, rng, y, 'middle');
        const why = rate > 0.9 ? '体を壊して受験できず' : p.familyClass <= 2 ? '家計を助けるため' : '家の事情で';
        if (y < 1873) return { ok: false, text: `${school}で学び続けたかったが、${why}働くことになった。` };
        return { ok: false, text: `${school}に行きたかったが、${why}働くことになった。この年の${y < 1948 ? '中学校・高等女学校への進学率' : '高校進学率'}は${pct(rate * 100)}だった。` };
      }
      findJob(st, p, rng, y, 'middle');
      if (y < 1873) return { ok: true, text: '学問はここまでにして、働き始めた。' };
      return { ok: true, text: rate > 0.9 ? `中学を出て働き始めた。同級生のほとんどは高校に進んだ（進学率${pct(rate * 100)}）。` : y < 1948 ? '学校を終えて働き始めた。' : `中学を出て働き始めた。` };
    },
    auto: () => 'go',
  },
  // 6. 欲しいもの
  {
    id: 'gadget',
    age: 16,
    title: 'いちばん欲しいもの',
    prompt: '16歳。お金をためて、何を手に入れたい？',
    evidence: (p) => `${yearOf(p)}年。`,
    options: [
      { id: 'music', label: '音楽を聴く機械' },
      { id: 'phone', label: '自分専用の電話' },
      { id: 'game', label: 'ゲーム' },
      { id: 'bike', label: 'オートバイ・自転車' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      const rich = p.familyClass >= 3 || p.job !== null;
      if (opt === 'music') {
        if (y < 1925) return { ok: true, text: '祭りの囃子や、門付け（家々を回る芸人）の三味線に聞きほれた。音楽は、その場で聴くものだった。' };
        if (y < 1955) return { ok: true, text: '家のラジオで流行歌を聴いた。自分だけの機械など、考えられなかった。' };
        if (y < 1979) return { ok: rich, text: rich ? 'トランジスタラジオを手に入れた。' : 'ラジオは家に1台だけだった。' };
        if (y < 2001) return { ok: true, text: 'ヘッドホンステレオを手に入れ、どこでも音楽を聴いた。' };
        return { ok: true, text: 'スマートフォンで、聴き放題の音楽を聴いた。' };
      }
      if (opt === 'phone') {
        if (y < 1890) return { ok: false, text: '電話というものは、まだなかった。遠くの人への知らせは、手紙や人づてだった。' };
        if (y < 1985) return { ok: false, text: '自分専用の電話など、なかった。電話は家に1台、または近所で借りるものだった。' };
        if (y < 1995) {
          const ok = rich && rng.chance(0.4);
          return { ok, text: ok ? 'ポケットベルを持った。数字の語呂合わせでやりとりした。' : 'ポケットベルがほしかったが、買ってもらえなかった。家の電話の子機を部屋に持ちこんだ。' };
        }
        if (y < 2008) return { ok: true, text: '携帯電話を手に入れた。メールを打つのが速くなった。' };
        return { ok: true, text: 'スマートフォンを手に入れた。友だちとはいつもつながっていた。' };
      }
      if (opt === 'game') {
        if (y < 1950) return { ok: false, text: '欲しいものを口に出せる暮らしではなかった。遊び道具は自分で作るものだった。' };
        if (y < 1983) return { ok: false, text: '家でできるテレビゲームは、まだ普及していなかった。' };
        const ok = rich || rng.chance(0.5);
        if (!ok) return { ok, text: 'ゲームは買ってもらえなかった。友だちの家で遊ばせてもらった。' };
        return { ok, text: y < 2000 ? '家庭用ゲーム機を手に入れた。' : 'ゲームを買って、友だちとオンラインで遊んだ。' };
      }
      if (y < 1900) return { ok: false, text: '自転車はまだ珍しく、どこへ行くにも歩いた。遠くへは、駕籠や馬、舟を使った。' };
      if (y < 1960) return { ok: rich, text: rich ? '中古の自転車を手に入れた。' : '自転車は家の仕事に使う大事な道具だった。' };
      return { ok: true, text: y < 1990 ? 'オートバイの免許をとった。' : '自転車で、遠くの町まで出かけた。' };
    },
    auto: (_st, rng) => rng.pick(['music', 'phone', 'game', 'bike']),
  },
  // 7. 大学
  {
    id: 'college',
    age: 18,
    title: '高校を出たら',
    prompt: '18歳。高校を出たら、どうしたい？',
    applies: (st) => st.persons.some((p) => p.alive && p.inSchool === 'high'),
    relevant: (p) => p.inSchool === 'high',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1877) return `${y}年。大学にあたるのは、江戸や大坂、長崎の名高い塾や学問所への遊学（ごく少数）。短大・専門学校にあたるのは、医術や算術などの専門の塾。`;
      if (y < 1890) return `${y}年。東京大学（1877年）など、高等教育を受けるのは${sexWord(p)}の${pct1(S.eduRate('university', y, p.sex))}ほど（目安）。`;
      return `${y}年の大学進学率は${sexWord(p)}${pct(S.eduRate('university', y, p.sex))}、短大は${pct(S.eduRate('juniorCollege', y, p.sex))}。入試は${entranceExam(y)}。`;
    },
    options: [
      { id: 'univ', label: '大学に行きたい' },
      { id: 'junior', label: '短大・専門学校に行きたい' },
      { id: 'work', label: '就職したい' },
    ],
    resolve: (p, opt, st, rng) => {
      const y = yearOf(p);
      p.edu = 'high';
      p.inSchool = null;
      if (opt === 'work') {
        findJob(st, p, rng, y, 'high');
        return { ok: true, text: '高校を出て働き始めた。' };
      }
      const hs = Math.max(1, S.eduRate('highSchool', y - 3, p.sex));
      const kind = opt === 'univ' ? 'university' : 'juniorCollege';
      const rate = S.eduRate(kind, y, p.sex);
      const cond = Math.min(0.95, rate / hs);
      // 江戸・明治の初めは、高等の学びに進む道がさらに狭い（目安：上乗せをしない）
      const prob = wishProb(cond, p, y < 1890 ? -0.4 : 0.4);
      const label = y < 1877 ? (opt === 'univ' ? '遊学' : '専門の塾') : y < 1950 ? (opt === 'univ' ? '高等教育' : '専門学校') : opt === 'univ' ? '大学' : '短大';
      if (y < 1890) {
        // 江戸・明治前半：遊学や高等教育は、ごく一部（目安）
        if (rng.chance(prob)) {
          p.inSchool = opt === 'univ' ? 'univ' : 'junior';
          p.stats.knowledge = Math.min(100, p.stats.knowledge + 8);
          if (!S.METRO.has(p.pref)) p.movedToCity = true;
          return { ok: true, text: y < 1877 ? (opt === 'univ' ? '江戸や大坂の名高い塾に遊学し、学問を深めた。' : '医術の塾に入り、医者の見習いになった。') : opt === 'univ' ? '東京に出て、高等教育を受けた。' : '専門の学校に入った。' };
        }
        p.wishes.push({ age: 18, wish: label, result: '働いた', ok: false });
        findJob(st, p, rng, y, 'high');
        return { ok: false, text: `${label}を望んだが、${p.familyClass <= 3 ? '家にその余裕はなかった' : 'その道は狭かった'}。働き始めた。` };
      }
      if (rng.chance(prob)) {
        p.inSchool = opt === 'univ' ? 'univ' : 'junior';
        p.stats.knowledge = Math.min(100, p.stats.knowledge + 6);
        let extra = '';
        if (opt === 'univ' && y >= 1979) extra += `${entranceExam(y)}を受けた。`;
        if (y >= 2004 && p.familyClass <= 3 && rng.chance(0.6)) {
          // 日本学生支援機構の貸与奨学金。総額は目安
          const loan = (opt === 'univ' ? 3_000_000 : 1_500_000) * (0.8 + rng.next() * 0.6);
          p.money -= loan;
          p.flags.push('student_loan');
          extra += `奨学金を約${man(loan)}借りた。卒業後に返していく。`;
        }
        if (!S.METRO.has(p.pref) && rng.chance(0.4)) {
          p.movedToCity = true;
          extra += '進学のために上京した。';
        }
        const rare = rate < 15 ? `同じ年の${sexWord(p)}で${label}に進んだのは${pct(rate)}。` : '';
        return { ok: true, text: `${label}に進んだ。${rare}${extra}` };
      }
      // 浪人（暮らしに余裕があれば）
      if (p.familyClass >= 3 && y >= 1960 && rng.chance(0.5)) {
        if (rng.chance(0.55)) {
          p.inSchool = opt === 'univ' ? 'univ' : 'junior';
          p.flags.push('ronin');
          return { ok: true, text: `一度は不合格になり、1年浪人して${label}に入った。` };
        }
      }
      p.wishes.push({ age: 18, wish: `${label}進学`, result: '高校を出て就職', ok: false });
      findJob(st, p, rng, y, 'high');
      const why = p.familyClass <= 2 ? '学費を出す余裕が家になかった' : p.sex === 'female' && y < 1975 ? '「女に学問はいらない」と言われた' : '合格できなかった';
      return { ok: false, text: `${label}に行きたかったが、${why}。高校を出て働き始めた。この年の${label}進学率は${pct(rate)}だった。` };
    },
    auto: (_st, rng) => (rng.chance(0.75) ? 'univ' : 'junior'),
  },
  // 8. タバコ
  {
    id: 'smoke',
    age: 19,
    title: 'タバコ',
    prompt: '成人が近い。タバコを吸う？',
    evidence: (p) => {
      const y = yearOf(p);
      return y < 1970 ? `${y}年ごろ、成人男性の8割ほどがタバコを吸っていた（目安）。` : y < 2000 ? `${y}年、成人男性の喫煙率は5〜6割（目安）。` : `${y}年、成人男性の喫煙率は3割前後（目安）。`;
    },
    options: [
      { id: 'yes', label: '吸う' },
      { id: 'no', label: '吸わない' },
    ],
    resolve: (p, opt, st) => {
      const y = yearOf(p) + 1;
      if (opt === 'yes') {
        st.prefs.smoke = true;
        p.flags.push('smoker');
        if (y < 1900) return { ok: true, text: 'キセルで刻み煙草を吸い始めた。煙草入れを腰に下げるのが、大人のしるしだった。' };
        return { ok: true, text: y < 1975 ? 'タバコを吸い始めた。職場でも汽車の中でも、みんな吸っていた。' : y < 2003 ? 'タバコを吸い始めた。' : 'タバコを吸い始めた。吸える場所はどんどん減っていた。' };
      }
      // 吸わないと決めたら、そのあとの出来事で吸い始めることはない
      p.flags.push('nonsmoker');
      if (p.flags.includes('smoker')) {
        p.flags = p.flags.filter((f) => f !== 'smoker');
        st.prefs.smoke = false;
        return { ok: true, text: '覚えたばかりのタバコを、やめると決めた。' };
      }
      if (y < 1900 && p.sex === 'male') return { ok: true, text: '吸わなかった。周りの大人たちは、休むたびにキセルをくゆらせていた。' };
      if (y < 1980 && p.sex === 'male') {
        p.stats.health = Math.max(0, p.stats.health - 2);
        return { ok: true, text: '吸わなかった。それでも、職場も家もタバコの煙でいっぱいだった。' };
      }
      return { ok: true, text: '吸わなかった。' };
    },
    auto: (_st, rng) => (rng.chance(0.4) ? 'yes' : 'no'),
  },
  // 9. 結婚観
  {
    id: 'marriage',
    age: 20,
    title: '結婚',
    prompt: '20歳。結婚について、どう考える？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1935) return `${y}年ごろ、結婚相手は親や仲人が決めるのが当たり前だった。初婚年齢は${p.sex === 'male' ? '男性' : '女性'}${S.meanMarriageAge(y, p.sex).toFixed(1)}歳ほど（${y < 1899 ? '推計' : '目安'}）。`;
      return `${y}年ごろ、見合い結婚は${pct(arrShare(y) * 100)}。平均初婚年齢は${p.sex === 'male' ? '男性' : '女性'}${S.meanMarriageAge(y, p.sex).toFixed(1)}歳。`;
    },
    options: [
      { id: 'arranged', label: '見合い（親の決めた相手）でもいい。早く結婚したい' },
      { id: 'love', label: '好きな人と結婚したい' },
      { id: 'no', label: '結婚しなくてもいい' },
    ],
    resolve: (p, opt, st) => {
      st.prefs.marryWish = opt as 'arranged' | 'love' | 'no';
      const y = yearOf(p);
      if (opt === 'no') {
        const never = S.neverMarried50(Math.min(y + 30, 2020), p.sex);
        return { ok: true, text: never < 5 ? `結婚しないと決めた。ただ、この世代は50歳までに${pct(100 - never)}が結婚する。周りの目は厳しかった。` : '結婚しなくてもいいと思った。' };
      }
      const share = pct(arrShare(y) * 100);
      if (y < 1935) {
        if (opt === 'arranged') return { ok: true, text: '親の決めた相手でいいと思った。それが当たり前の時代だった。' };
        return { ok: true, text: '好きな人と結婚したいと思った。ただ、家と家の結びつきである結婚は、親や仲人が決めるのが当たり前だった。' };
      }
      if (opt === 'arranged') {
        return { ok: true, text: y < 1965 ? `見合いでもいいと思った。見合い結婚が当たり前の時代だった（見合い${share}）。` : y < 1995 ? `見合いでもいいと思った。周りでは恋愛結婚が増えていた（見合い${share}）。` : `見合いでもいいと思った。見合い結婚は${share}まで減り、結婚相談所やアプリで相手を探す人もいた。` };
      }
      return { ok: true, text: y < 1965 ? `好きな人と結婚したいと思った。ただ、この時代は${share}が見合い結婚で、親の意向も強かった。` : y < 1995 ? '好きな人と結婚したいと思った。恋愛結婚が多数派になっていた。' : '好きな人と結婚したいと思った。職場や学校のほか、ネットで知り合う人も増えていた。' };
    },
    auto: (_st, rng) => (rng.chance(0.5) ? 'arranged' : 'love'),
  },
  // 10. 上京
  {
    id: 'city',
    age: 21,
    title: '都会へ出るか',
    prompt: '21歳。生まれた県を出て、東京や大阪で暮らしたい？',
    applies: (st) => st.persons.some((p) => p.alive && !p.movedToCity),
    relevant: (p) => !p.movedToCity,
    evidence: (p) => {
      const y = yearOf(p);
      const west = p.pref >= 25 && p.pref !== 47;
      if (isEdo(y)) return `${y}年。${S.placeName(p.pref, y)}から${west ? '大坂' : '江戸'}へ。村を出るには、通行手形と、村や家の許しが要った。`;
      return `${y}年。${S.placeName(p.pref, y)}から大都市圏へ。`;
    },
    options: [
      {
        id: 'go',
        label: '都会へ出たい',
        available: (p) => (OKINAWA_US(p, yearOf(p)) ? { ok: true, reason: '本土へ渡るには渡航の証明書が必要だった' } : { ok: true }),
      },
      { id: 'stay', label: '地元に残りたい' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      if (opt === 'stay') return { ok: true, text: '地元に残った。' };
      if (p.flags.includes('samurai_heir') && isEdo(y)) {
        p.wishes.push({ age: 21, wish: '国を出ること', result: '家督を継ぐため残った', ok: false });
        return { ok: false, text: '国を出たかったが、武士が勝手に藩を離れることは許されなかった（脱藩は重い罪だった）。' };
      }
      if (p.job === 'farm' && p.flags.includes('heir') && y < 1970) {
        p.wishes.push({ age: 21, wish: '上京', result: '家を継ぐため地元に残った', ok: false });
        return { ok: false, text: '都会に出たかったが、家と田畑を守るために残った。' };
      }
      const okinawa = OKINAWA_US(p, y);
      p.movedToCity = true;
      p.stats.happiness = Math.min(100, p.stats.happiness + 4);
      if (p.job === 'farm' || p.job === 'self') {
        p.job = 'smallco';
        p.jobTitle = '中小企業の勤め人';
      }
      const west = p.pref >= 25 && p.pref !== 47;
      const t =
        okinawa
          ? 'アメリカの統治下にあった沖縄から、渡航の証明書を持って本土へ渡った。'
          : isEdo(y)
            ? `通行手形を手に、何日も歩いて${west ? '大坂' : '江戸'}へ出た。出稼ぎや奉公の口を探した。`
            : y < 1889
              ? `何日もかけて${west ? '大阪' : '東京'}へ出た。${y >= 1872 ? '途中から、開通したばかりの汽車や汽船に乗った。' : ''}`
              : y < 1930
                ? `汽車に乗って${west ? '大阪' : '東京'}へ出た。`
                : y < 1975
            ? '夜行列車に乗って都会に出た。高度成長のさなかだった。'
            : y < 2000
              ? '都会に出て、狭いアパートで一人暮らしを始めた。'
              : y < 2020
                ? '都会に出て、シェアハウスで暮らし始めた。'
                : '都会に出た。仕事の多くはオンラインでもできた。';
      if (p.job && rng.chance(0.3)) p.job = 'smallco';
      return { ok: true, text: t };
    },
    auto: (_st, rng) => (rng.chance(0.35) ? 'go' : 'stay'),
  },
  // 11. 海外
  {
    id: 'abroad',
    age: 23,
    title: '海外',
    prompt: '23歳。海外に行ってみたい？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1866) return `${y}年。日本人が海外へ渡ることは禁じられていた（いわゆる鎖国。海外渡航が許されたのは1866年）。`;
      if (y < 1949) return `${y}年。海外へ渡るのは、留学や仕事、移民など、限られた人だった。`;
      return y < 1964 ? `${y}年。観光のための海外渡航は、まだ自由化されていない（自由化は1964年）。1ドル＝360円。` : y < 1971 ? `${y}年。1ドル＝360円の固定相場。海外旅行は高嶺の花。` : y < 2020 ? `${y}年。` : y < 2023 ? `${y}年。新型コロナウイルスの感染拡大で、海外との行き来が制限された。` : `${y}年。`;
    },
    options: [
      {
        id: 'study',
        label: '留学したい',
        available: (p) => (yearOf(p) < 1964 ? { ok: true, reason: '留学できたのは、奨学金を得たごく一部だった' } : { ok: true }),
      },
      {
        id: 'travel',
        label: '海外旅行に行きたい',
        available: (p) => (yearOf(p) < 1866 ? { ok: false, reason: '日本人が国を出ることは禁じられていた' } : yearOf(p) < 1964 ? { ok: false, reason: '観光での海外渡航は1964年まで自由化されていない' } : { ok: true }),
      },
      { id: 'stay', label: '国内で十分' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      if (opt === 'stay') return { ok: true, text: '国内で十分だと思った。' };
      if (y < 1866) {
        p.wishes.push({ age: 23, wish: opt === 'study' ? '海外で学ぶこと' : '海の外を見ること', result: '国を出ることは禁じられていた', ok: false });
        return { ok: false, text: '海の向こうを見てみたかったが、日本人が国を出ることは禁じられていた。' };
      }
      if (y >= 2020 && y <= 2022) {
        p.wishes.push({ age: 23, wish: opt === 'study' ? '留学' : '海外旅行', result: '感染拡大で行けなかった', ok: false });
        return { ok: false, text: '行きたかったが、新型コロナウイルスの感染拡大で、海外へはほとんど行けなかった。' };
      }
      if (opt === 'travel') {
        if (y < 1964) {
          p.wishes.push({ age: 23, wish: '海外旅行', result: '自由化前で行けなかった', ok: false });
          return { ok: false, text: '海外を見てみたかったが、観光で国を出ることはまだ許されていなかった。' };
        }
        const ok = rng.chance(y < 1972 ? 0.08 * p.familyClass : y < 1986 ? 0.15 * p.familyClass : 0.8);
        if (!ok) return { ok: false, text: '行きたかったが、海外旅行は高くて手が届かなかった。' };
        p.stats.happiness = Math.min(100, p.stats.happiness + 6);
        return { ok: true, text: y < 1986 ? 'パック旅行でハワイへ行った。一生の思い出になった。' : y < 2012 ? '円高で、海外旅行が身近になっていた。友だちと出かけた。' : '安い航空券で、アジアの国へ出かけた。' };
      }
      const prob = y < 1964 ? 0.01 * p.familyClass : y < 1985 ? 0.03 * p.familyClass : 0.06 * p.familyClass;
      if (rng.chance(prob)) {
        p.stats.knowledge = Math.min(100, p.stats.knowledge + 10);
        p.flags.push('studied_abroad');
        return { ok: true, text: y < 1964 ? '奨学金を得て、船で海を渡り、留学した。' : '1年間、海外に留学した。' };
      }
      p.wishes.push({ age: 23, wish: '留学', result: '行けなかった', ok: false });
      return { ok: false, text: '留学したかったが、費用も機会もなかった。' };
    },
    auto: (_st, rng) => rng.pick(['study', 'travel', 'stay']),
  },
  // 12. 車
  {
    id: 'car',
    age: 25,
    title: '車',
    prompt: '25歳。車を持ちたい？',
    evidence: (p) => `${yearOf(p)}年。`,
    options: [
      { id: 'buy', label: '車を買いたい' },
      { id: 'no', label: '車はいらない' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      if (opt === 'no') return { ok: true, text: y < 1910 ? 'どこへ行くにも歩くのが当たり前だった。' : S.METRO.has(p.pref) || p.movedToCity ? '電車があれば十分だった。' : '車がなくても、なんとか暮らせた。' };
      const w = S.annualWage(y, 25, p.sex, p.edu);
      if (y < 1910) {
        p.wishes.push({ age: 25, wish: '車', result: '自動車がなかった', ok: false });
        return { ok: false, text: y < 1870 ? '車といえば、荷を運ぶ大八車のことだった。人は歩くか、駕籠や馬に乗った。' : '自動車は、日本ではまだほとんど見かけなかった。町では人力車が走っていた。' };
      }
      if (y < 1960) {
        p.wishes.push({ age: 25, wish: '車', result: '買えなかった', ok: false });
        return { ok: false, text: '車は、まだ会社や金持ちのものだった。自家用車を持つ人はわずかだった。' };
      }
      const price = w * (y < 1970 ? 1.5 : y < 1990 ? 0.6 : 0.5);
      if (y < 1970 && !rng.chance(0.2 * p.familyClass)) return { ok: false, text: '車がほしかったが、手が届かなかった。' };
      p.money -= price;
      p.stats.happiness = Math.min(100, p.stats.happiness + 4);
      return { ok: true, text: y < 1972 ? 'マイカーを手に入れた。家族で出かけるのが楽しみになった。' : y < 2000 ? `車を買った。約${man(price)}。` : `車を買った。約${man(price)}。周りでは、車を持たない若者も増えていた。` };
    },
    auto: (_st, rng) => (rng.chance(0.5) ? 'buy' : 'no'),
  },
  // 13. 子ども
  {
    id: 'children',
    age: 27,
    title: '子ども',
    prompt: '27歳。子どもは何人ほしい？',
    evidence: (p) => {
      const y = yearOf(p);
      const cf = S.completedFertility(y);
      if (y < 1940) return `${y}年ごろ、結婚した女性が一生に産む子どもは${cf ? `${cf.toFixed(1)}人ほど` : '4〜5人ほど'}（${y < 1890 ? '推計' : '目安'}）。1歳を迎えられない子も多かった。${p.married ? '' : '（まだ結婚していない）'}`;
      return `${y}年ごろ、夫婦の最終的な子どもの数は平均${y < 1960 ? '3人前後' : '2人前後'}（出生動向基本調査）。${p.married ? '' : '（まだ結婚していない）'}`;
    },
    options: [
      { id: '0', label: '子どもはいなくてもいい' },
      { id: '1', label: '1人' },
      { id: '2', label: '2人' },
      { id: '3', label: '3人以上' },
    ],
    resolve: (p, opt, st) => {
      const n = Number(opt) === 3 ? 4 : Number(opt);
      st.prefs.childrenWish = n;
      p.wantChildren = Math.max(n, p.children.length);
      const y = yearOf(p);
      if (y < 1900) {
        if (n === 0) return { ok: true, text: '子どもはいなくてもいいと思った。ただ、家を継ぐ子がいなければ、養子をとるのが当たり前だった。' };
        return { ok: true, text: n === 4 ? '子どもはたくさんほしいと思った。子は家の働き手で、跡取りでもあった。' : `子どもは${n}人ほしいと思った。` };
      }
      if (n === 0) return { ok: true, text: y < 1970 ? '子どもはいなくてもいいと思った。ただ、周りからは「まだか」と何度も聞かれた。' : y < 2000 ? '子どもはいなくてもいいと思った。まだ少数派の考えだった。' : '子どもはいなくてもいいと思った。子どもを持たない夫婦も増えていた。' };
      if (n === 4) return { ok: true, text: y < 1960 ? '子どもは3人以上ほしいと思った。きょうだいが多いのは珍しくなかった。' : y < 2000 ? '子どもは3人以上ほしいと思った。2人が当たり前と言われる中では、多いほうだった。' : '子どもは3人以上ほしいと思った。教育費を考えると、思い切った望みだった。' };
      return { ok: true, text: `子どもは${n}人ほしいと思った。${y >= 2000 && n >= 2 ? '保育園に入れるかが心配だった。' : ''}` };
    },
    auto: (_st, rng) => rng.pick(['1', '2', '2', '3']),
  },
  // 14. 仕事と家庭
  {
    id: 'workfamily',
    age: 29,
    title: '仕事と家庭',
    prompt: '29歳。子育てと仕事、どちらを大事にしたい？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1900) return `${y}年。家の仕事は、家族みんなで担うものだった。${p.sex === 'female' ? '女性も田畑や機織り、店の仕事をしながら子を育てた。' : ''}`;
      return y < 1986 ? `${y}年。男女雇用機会均等法（1986年施行）の前。` : y < 1992 ? `${y}年。育児休業法（1992年施行）の前。` : `${y}年。`;
    },
    options: [
      { id: 'keep', label: '仕事を続けたい' },
      { id: 'home', label: '家庭を優先したい' },
    ],
    resolve: (p, opt, st, rng) => {
      st.prefs.keepWorking = opt === 'keep';
      const y = yearOf(p);
      if (y < 1900) {
        if (p.sex === 'male') return { ok: true, text: opt === 'home' ? '家にいる時間を大事にした。仕事場と家が同じ家も多かった。' : '仕事に打ちこんだ。' };
        if (opt === 'keep') {
          if (p.job === 'none') {
            startWork(p, 'self', '内職を始めた', y, '機織りや針仕事の内職を始めた。');
            return { ok: true, text: '子を背負いながら、機織りや針仕事の内職で家計を支えた。' };
          }
          return { ok: true, text: '子を背負いながら、仕事を続けた。' };
        }
        return { ok: true, text: '子育てと家の仕事を優先した。' };
      }
      if (p.sex === 'male') {
        if (opt === 'home') {
          if (y < 2010) return { ok: false, text: '家庭を大事にしたかったが、職場では「男は仕事」が当たり前で、帰りはいつも遅かった。' };
          const ok = rng.chance(y < 2020 ? 0.25 : 0.5);
          return { ok, text: ok ? '育児休業をとって、子どもと過ごす時間をつくった。男性の育休はまだ少数派だった。' : '育児休業をとりたかったが、職場で言い出せなかった。' };
        }
        return { ok: true, text: y >= 1960 && y < 1990 ? 'モーレツに働いた。' : y < 1960 ? '仕事に打ちこんだ。' : '仕事を続けた。' };
      }
      if (opt === 'keep') {
        if (p.job === 'none') {
          if (rng.chance(y < 1985 ? 0.25 : 0.5)) {
            startWork(p, 'smallco', 'パートで働き始めた', y, 'もう一度働きたいと思い、パートで働き始めた。');
            p.flags.push('part_time');
            return { ok: true, text: 'パートで働き始めた。正社員に戻る道は狭かった。' };
          }
          return { ok: false, text: '働きたかったが、子どもを預ける先が見つからなかった。' };
        }
        return { ok: true, text: '仕事を続けると決めた。' };
      }
      return { ok: true, text: '家庭を優先すると決めた。' };
    },
    auto: (_st, rng) => (rng.chance(0.5) ? 'keep' : 'home'),
  },
  // 15. 家
  {
    id: 'house',
    age: 33,
    title: '住まい',
    prompt: '33歳。家を買う？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1900) return `${y}年。${S.METRO.has(p.pref) || p.movedToCity ? '町では、長屋や借家に住むのがふつうだった。' : '村では、家は代々受け継ぐものだった。'}`;
      if (y < 1955) return `${y}年。借家に住む人が多かった（目安）。`;
      return `${y}年。定期預金の金利はおよそ${S.interp({ '1960': 5.5, '1975': 6.5, '1985': 4.5, '1995': 0.5, '2000': 0.05 }, y)?.toFixed(1)}%（目安）。`;
    },
    options: [
      { id: 'buy', label: '家を買いたい' },
      { id: 'rent', label: '賃貸でいい' },
      { id: 'parents', label: '親と同居したい', available: (p) => (p.fatherAlive || p.motherAlive ? { ok: true } : { ok: false, reason: '親はもう亡くなっている' }) },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      const w = S.annualWage(y, 33, p.sex, p.edu) * (p.married ? 1.3 : 1);
      if (opt === 'rent') return { ok: true, text: y < 1900 ? (S.METRO.has(p.pref) || p.movedToCity ? '長屋を借りて暮らした。井戸も便所も、長屋の皆で使った。' : '借家で暮らした。') : y < 1955 ? '借家で暮らした。' : y < 1975 ? '公団の団地に申し込み、抽選に当たった。' : '賃貸で暮らした。' };
      if (opt === 'parents') {
        p.flags.push('three_generations');
        return { ok: true, text: y < 1980 ? '親と同じ家で暮らした。三世代で住むのが珍しくなかった。' : '親と同居した。' };
      }
      // 住宅価格は年収の何倍か（目安）。バブル期の首都圏は特に高い
      const metro = S.METRO.has(p.pref) || p.movedToCity;
      let ratio = y < 1970 ? 4 : y < 1986 ? 5 : y < 1992 ? (metro ? 8 : 5.5) : 5.5;
      const price = w * ratio;
      const can = p.money > price * 0.1 || rng.chance(0.4 + p.familyClass * 0.1);
      if (!can || p.income === 0) {
        p.wishes.push({ age: 33, wish: '持ち家', result: '買えなかった', ok: false });
        return { ok: false, text: y < 1900 ? '自分の家を建てたかったが、その蓄えはなかった。' : `家がほしかったが、頭金がたまらなかった。家は年収の${ratio}倍ほどした。` };
      }
      p.money -= price;
      p.flags.push('homeowner');
      p.stats.happiness = Math.min(100, p.stats.happiness + 6);
      if (y < 1900) return { ok: true, text: '大工に頼んで、家を建てた。棟上げの日には、近所の人が集まって祝ってくれた。' };
      const t = y >= 1987 && y <= 1991 ? `バブルのさなかに、年収の${ratio}倍で家を買った。数年後、値段は大きく下がった。` : y < 1975 ? '郊外に小さな一戸建てを建てた。' : `家を買った。約${man(price)}のローンを組んだ。`;
      return { ok: true, text: t };
    },
    auto: (_st, rng) => rng.pick(['buy', 'rent', 'parents']),
  },
  // 16. 転職
  {
    id: 'career',
    age: 38,
    title: '働き方を変える',
    prompt: '38歳。今の仕事を続ける？',
    applies: (st) => st.persons.some((p) => p.alive && p.job !== null && p.job !== 'none'),
    relevant: (p) => p.job !== null && p.job !== 'none',
    evidence: (p) => (yearOf(p) < 1920 ? `${yearOf(p)}年。${isEdo(yearOf(p)) ? '奉公先を替えたり、暖簾分け（主人の許しを得て独立）で店を持ったりする人がいた。' : '失業や求人の統計は、まだない。'}` : yearOf(p) >= 1963 ? `${yearOf(p)}年の有効求人倍率は${S.jobOpenings(yearOf(p)).toFixed(2)}倍、完全失業率は${pct1(S.unemployment(yearOf(p)))}。` : `${yearOf(p)}年。完全失業率は${pct1(S.unemployment(yearOf(p)))}（有効求人倍率の統計は1963年から）。`),
    options: [
      { id: 'stay', label: '今の仕事を続けたい' },
      { id: 'change', label: '転職したい' },
      { id: 'start', label: '独立したい' },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      const jo = S.jobOpenings(y);
      if (opt === 'stay') return { ok: true, text: y < 1890 ? '今の仕事を続けた。' : y < 1990 && p.job === 'bigco' ? '定年まで勤めるつもりだった。終身雇用が当たり前だった。' : '今の仕事を続けた。' };
      if (isEdo(y) && p.job === 'public') {
        p.wishes.push({ age: 38, wish: opt === 'change' ? '仕事を替えること' : '独立', result: '武士の身分は捨てられなかった', ok: false });
        return { ok: false, text: '役目を替えたいと思ったが、武士の役目は家の格で決まっていた。' };
      }
      if (y < 1890 && opt === 'start' && p.job === 'bigco' && rng.chance(0.5)) {
        p.job = 'self';
        p.jobTitle = jobLabelAt('self', y);
        return { ok: true, text: '長年の奉公が認められ、暖簾分け（主人の許しを得て同じ屋号で独立すること）で自分の店を持った。' };
      }
      if (opt === 'change') {
        const ok = rng.chance(Math.min(0.85, 0.25 + jo * 0.3));
        if (ok) {
          p.flags = p.flags.filter((f) => f !== 'part_time');
          p.job = rng.chance(0.3) ? 'bigco' : 'smallco';
          p.jobTitle = jobLabelAt(p.job, y);
          return { ok: true, text: y < 1890 ? '別の店に移った。' : y < 1990 ? '転職した。中途で入るのは、まだ珍しかった。' : '転職した。' };
        }
        p.wishes.push({ age: 38, wish: '転職', result: '見つからなかった', ok: false });
        return { ok: false, text: `転職したかったが、よい仕事は見つからなかった${y >= 1963 ? `（有効求人倍率${jo.toFixed(2)}倍）` : ''}。` };
      }
      const ok = rng.chance(0.3 + p.stats.knowledge / 300);
      if (ok) {
        p.job = 'self';
        p.jobTitle = y < 1890 ? jobLabelAt('self', y) : '自営業';
        p.flags = p.flags.filter((f) => f !== 'part_time');
        return { ok: true, text: y < 1890 ? '独立して、小さな商いを始めた。' : '独立して、自分の事業を始めた。' };
      }
      p.money *= 0.7;
      return { ok: false, text: '独立したが、うまくいかず、また勤めに出た。' };
    },
    auto: (_st, rng) => (rng.chance(0.7) ? 'stay' : 'change'),
  },
  // 17. お金
  {
    id: 'money',
    age: 45,
    title: 'お金の置き場所',
    prompt: '45歳。たまったお金を、どうする？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1873) return `${y}年。銀行はまだない（日本で最初の銀行は1873年）。お金は両替商に預けるか、家にしまっておいた。`;
      if (y < 1900) return `${y}年。銀行ができ始めたころ。`;
      return `${y}年。定期預金の金利はおよそ${S.interp({ '1960': 5.5, '1975': 6.5, '1985': 4.5, '1995': 0.5, '2000': 0.05 }, y)?.toFixed(2)}%（目安）。`;
    },
    options: [
      { id: 'save', label: '銀行に預ける' },
      { id: 'stock', label: '株を買う' },
      { id: 'spend', label: '旅行や趣味に使う' },
    ],
    resolve: (p, opt, st) => {
      st.prefs.invest = opt as 'save' | 'stock' | 'spend';
      const y = yearOf(p);
      if (y < 1890) {
        if (opt === 'spend') {
          p.stats.happiness = Math.min(100, p.stats.happiness + 8);
          p.money *= 0.8;
          return { ok: true, text: '講（仲間で旅費を積み立てる集まり）の仲間と、お伊勢参りに出かけた。一生に一度の旅だった。' };
        }
        if (opt === 'save') return { ok: true, text: y < 1873 ? 'お金は両替商に預け、残りは壺に入れて床下にしまった。' : '開業したばかりの銀行に預けてみた。' };
        return { ok: true, text: isEdo(y) ? '米の相場に手を出した。大坂の堂島では、米の先物の取引が行われていた。' : '株を買ってみた。株式の取引所は1878年にできたばかりだった。' };
      }
      if (opt === 'spend') {
        p.stats.happiness = Math.min(100, p.stats.happiness + 8);
        p.money *= 0.8;
        if (y >= 1938 && y <= 1952) return { ok: false, text: '旅行どころではなく、家計を守るので精いっぱいだった。' };
        return { ok: true, text: y < 1985 ? '家族で温泉旅行に出かけ、趣味にもお金を使った。' : y >= 2020 && y <= 2022 ? '旅行には行けず、家で過ごす時間のための趣味にお金を使った。' : y < 2020 ? '家族で海外旅行に出かけ、趣味にもお金を使った。' : '旅行や趣味にお金を使った。' };
      }
      if (opt === 'save') return { ok: true, text: y < 1991 ? '定期預金に預けた。利息だけで、少しずつ増えていった。' : y < 2026 ? '銀行に預けた。利息はほとんどつかなかった。' : '銀行に預けた（この先の金利は見通しが立たない）。' };
      return {
        ok: true,
        text: y >= 1986 && y <= 1989 ? 'バブルのさなかに株を買った。値上がりが続いていた。' : y >= 1990 && y <= 2002 ? '株を買った。バブルがはじけたあとで、値下がりが続いていた。' : y >= 2024 && y <= 2026 ? '新しいNISAの口座で、投資信託を買い始めた。' : y > 2026 ? '株や投資信託を買った（この先の値動きは見通し）。' : '株を買った。',
      };
    },
    auto: (_st, rng) => rng.pick(['save', 'stock', 'spend']),
  },
  // 18. 介護
  {
    id: 'care',
    age: 52,
    title: '親の介護',
    prompt: '52歳。年老いた親の世話を、どうする？',
    applies: (st) => st.persons.some((p) => p.alive && (p.fatherAlive || p.motherAlive)),
    relevant: (p) => p.fatherAlive || p.motherAlive,
    evidence: (p) => (yearOf(p) < 1900 ? `${yearOf(p)}年。年老いた親は、家で家族が看るのが当たり前だった。` : yearOf(p) < 2000 ? `${yearOf(p)}年。介護保険（2000年）はまだない。` : `${yearOf(p)}年。介護保険で、ヘルパーや施設を使える。`),
    options: [
      { id: 'home', label: '自分で看る' },
      { id: 'facility', label: '施設やヘルパーに頼みたい' },
      { id: 'sibling', label: 'きょうだいに任せたい', available: (p) => (p.siblings > 1 ? { ok: true } : { ok: false, reason: 'ひとりっ子だった' }) },
    ],
    resolve: (p, opt, _st, rng) => {
      const y = yearOf(p);
      if (opt === 'facility' && y < 1900) {
        p.stats.health = Math.max(0, p.stats.health - 4);
        p.wishes.push({ age: 52, wish: '人の手を借りた介護', result: '家で看た', ok: false });
        return { ok: false, text: '人の手を借りたかったが、年寄りを預ける場所はなかった。家で看た。' };
      }
      if (opt === 'facility') {
        if (y < 2000 && !rng.chance(0.25)) {
          p.stats.health = Math.max(0, p.stats.health - 4);
          p.wishes.push({ age: 52, wish: '施設での介護', result: '家で看た', ok: false });
          return { ok: false, text: '施設に頼みたかったが、入れる施設はほとんどなかった。家で看た。' };
        }
        return { ok: true, text: y < 2000 ? '費用をかけて、施設に入ってもらった。' : '介護保険を使い、施設に入ってもらった。待っている人が多く、入れるまで時間がかかった。' };
      }
      if (opt === 'sibling') return { ok: true, text: 'きょうだいが面倒を見てくれた。' };
      p.stats.health = Math.max(0, p.stats.health - 5);
      p.stats.relation = Math.min(100, p.stats.relation + 5);
      if (p.sex === 'male' && y < 2000 && p.married) return { ok: true, text: '親を家で看た。実際に世話をしたのは、ほとんど妻だった。' };
      if (y < 2000) return { ok: true, text: '親を家で看た。頼れる制度はほとんどなく、家族だけで支えた。' };
      if (y <= 2026) return { ok: true, text: '親を家で看た。ヘルパーやデイサービスを使いながら、仕事と両立した。' };
      return { ok: true, text: '親を家で看た。介護の担い手は足りないと言われ続けていた（この先は見通し）。' };
    },
    auto: (_st, rng) => rng.pick(['home', 'facility', 'sibling']),
  },
  // 19. 定年後
  {
    id: 'retire',
    age: 58,
    title: '定年のあと',
    prompt: '58歳。定年のあとも働く？',
    evidence: (p) => {
      const y = yearOf(p);
      if (y < 1920) return `${y}年。定年の仕組みはまだ広まっておらず、家督や店を跡継ぎに譲って隠居するのが一般的だった。`;
      return y < 1986 ? `${y}年。定年は55歳が多かった（目安）。` : y < 2006 ? `${y}年。60歳定年が広がっていた（1998年から60歳未満の定年は禁止）。` : `${y}年。65歳までの雇用確保が企業の義務（2006年から）。`;
    },
    options: [
      { id: 'continue', label: '体が動くうちは働きたい' },
      { id: 'retire', label: '定年（隠居）で退いて、のんびりしたい' },
    ],
    resolve: (p, opt, st) => {
      st.prefs.retireAt = opt === 'continue' ? 65 : 55;
      const y = yearOf(p);
      if (y < 1920) return { ok: true, text: opt === 'continue' ? '体が動くうちは、仕事を続けるつもりだった。' : '跡継ぎに家を任せ、早めに隠居するつもりだった。' };
      if (opt === 'continue') return { ok: true, text: y < 1986 ? '55歳の定年のあとも、関連会社で働くつもりだった。' : y < 2006 ? '60歳の定年のあとも、嘱託として働くつもりだった。' : y <= 2026 ? '65歳まで、再雇用で働くつもりだった。' : '70歳まで働くつもりだった。そうする人は珍しくなくなっていた（見通し）。' };
      return { ok: true, text: y < 1986 ? '55歳の定年で辞め、のんびり暮らすと決めた。年金が出るまでの数年は、貯金で暮らす。' : y < 2006 ? '60歳の定年で辞めると決めた。' : '定年で辞めると決めた。年金が出るまでの暮らし方を考えた。' };
    },
    auto: (_st, rng) => (rng.chance(0.5) ? 'continue' : 'retire'),
  },
  // 20. 年金の受け取り方
  {
    id: 'pensiontiming',
    age: 59,
    title: '年金の受け取り方',
    prompt: '59歳。年金は、いつから受け取る？',
    applies: (st) => st.persons.some((p) => p.alive && p.pensionStartAge === undefined && hasPension(p)),
    relevant: (p) => p.pensionStartAge === undefined && hasPension(p),
    evidence: (p) => `この人の厚生年金の支給開始は${S.pensionStartAge(p.birthYear, p.birthMonth, p.sex)}歳（生まれた日で決まる）。`,
    options: [
      { id: 'early', label: 'なるべく早く（減額されてもいい）' },
      { id: 'normal', label: '決まった年齢から' },
      { id: 'late', label: '遅らせて、増やしたい' },
    ],
    resolve: (p, opt, st) => {
      st.prefs.pensionTiming = opt as 'early' | 'normal' | 'late';
      const start = S.pensionStartAge(p.birthYear, p.birthMonth, p.sex);
      return {
        ok: true,
        text: opt === 'early' ? `${Math.max(60, start - 3)}歳から、減額されても早く受け取ることにした。` : opt === 'late' ? `${Math.min(75, start + 5)}歳まで遅らせて、月額を増やすことにした。` : `${start}歳から受け取ることにした。`,
      };
    },
    auto: () => 'normal',
  },
  // 21. 晩年
  {
    id: 'later',
    age: 72,
    title: '晩年の過ごし方',
    prompt: '72歳。これからの時間を、何に使う？',
    evidence: (p) => `${yearOf(p)}年。${p.birthYear}年生まれの${p.sex === 'male' ? '男性' : '女性'}のうち、この年齢まで生きているのは約${Math.round(survival(p) * 100)}%。`,
    options: [
      { id: 'hobby', label: '趣味に打ち込む' },
      { id: 'family', label: '家族と過ごす' },
      { id: 'write', label: '自分の人生を書き残す' },
    ],
    resolve: (p, opt) => {
      const y = yearOf(p);
      p.stats.happiness = Math.min(100, p.stats.happiness + 6);
      if (opt === 'family') return { ok: true, text: p.children.length ? '孫の顔を見るのが楽しみになった。' : '近くに住む親戚と過ごす時間が増えた。' };
      if (y < 1900) return { ok: true, text: opt === 'write' ? '筆をとり、自分の来し方（これまでの人生）を書き留めた。' : '俳諧や盆栽、寺社参りを楽しんだ。' };
      if (opt === 'write') return { ok: true, text: y < 2005 ? '原稿用紙に、自分の生きてきた道を書いた。' : y < 2040 ? 'パソコンで、自分史を書いた。' : '声で話すだけで、自分史がまとまっていった。' };
      return { ok: true, text: y < 1960 ? '盆栽や庭いじり、謡（うたい）に打ち込んだ。' : y < 2000 ? 'ゲートボールや盆栽に打ち込んだ。' : y < 2040 ? '旅行や写真に打ち込んだ。' : '新しい趣味を見つけた。' };
    },
    auto: (_st, rng) => rng.pick(['hobby', 'family', 'write']),
  },
];

/** 保険料を納めて受け取る年金の対象か（1911年4月2日以降の生まれ。engine の pensionAndRetire と同じ境目） */
function hasPension(p: Person): boolean {
  return (p.birthMonth >= 4 ? p.birthYear : p.birthYear - 1) >= 1911;
}

function arrShare(year: number): number {
  if (year < 1935) return Math.min(0.9, 0.69 + (1935 - year) * 0.004);
  return (
    (S.interp({ '1935': 69.0, '1955': 53.9, '1967': 44.9, '1975': 30.4, '1985': 17.7, '1995': 9.6, '2005': 6.4, '2015': 5.3, '2022': 8.9 }, year) ?? 10) / 100
  );
}

function survival(p: Person): number {
  let s = 1;
  for (let a = 0; a < p.age; a++) s *= 1 - S.qx(p.birthYear + a, a, p.sex);
  return s;
}

/** その人に関係のない決断の理由（「この人は」で始める） */
function irrelevantReason(id: string, p: Person): string {
  if (id === 'college') return p.job && p.job !== 'none' ? `この人は中学を出てすでに働いているので、この決断はない。` : 'この人は高校に通っていないので、この決断はない。';
  if (id === 'city') return 'この人はもう都会で暮らしているので、この決断はない。';
  if (id === 'career') return 'この人はいま勤めに出ていないので、この決断はない。';
  if (id === 'care') return 'この人の両親はもう亡くなっているので、この決断はない。';
  if (id === 'pensiontiming') return hasPension(p) ? 'この人はもう年金を受け取っているので、この決断はない。' : 'この人の世代は、保険料を納めて受け取る年金の対象ではないので、この決断はない。';
  return 'この人には、この決断はない。';
}

/** この年齢で聞く決断（まだ済んでいないもの） */
export function dueDecision(st: GameState): DecisionDef | null {
  for (const d of DECISIONS) {
    if (d.age !== st.age || st.done.includes(d.id)) continue;
    if (!st.persons.some((p) => p.alive)) continue;
    if (d.applies && !d.applies(st)) {
      st.done.push(d.id);
      continue;
    }
    return d;
  }
  return null;
}

export function viewOf(st: GameState, d: DecisionDef): DecisionView {
  const alive = (p: Person) => p.alive;
  for (const p of st.persons) p.age = st.age;
  return {
    id: d.id,
    age: d.age,
    title: d.title,
    prompt: d.prompt,
    evidence: st.persons.map((p) => (alive(p) ? (d.relevant && !d.relevant(p, st) ? irrelevantReason(d.id, p) : d.evidence(p, st)) : '')),
    options: d.options.map((o) => ({
      id: o.id,
      label: o.label,
      hint: o.hint,
      availability: st.persons.map((p) => (alive(p) && o.available ? o.available(p, st) : { ok: true })),
    })),
  };
}

export function applyDecision(st: GameState, decisionId: string, optionId: string): DecisionResult {
  const d = DECISIONS.find((x) => x.id === decisionId);
  if (!d) throw new Error(`unknown decision ${decisionId}`);
  const rng = new Rng(st.rngState);
  const opt = d.options.find((o) => o.id === optionId)!;
  const results = st.persons.map((p) => {
    if (!p.alive) return null;
    p.age = st.age;
    if (d.relevant && !d.relevant(p, st)) return null;
    const av = opt.available ? opt.available(p, st) : { ok: true };
    const at = p.log.length; // 決断の記録は、決断で起きたこと（就職など）より前に置く
    let out: Outcome;
    if (!av.ok) {
      out = { ok: false, text: `「${opt.label}」は選べなかった。${av.reason ?? ''}。` };
      p.wishes.push({ age: p.age, wish: opt.label, result: av.reason ?? '選べなかった', ok: false });
    } else {
      out = d.resolve(p, optionId, st, rng);
    }
    const entry = log(p, out.ok ? 'decision' : 'wish', `${d.title}：${opt.label}`, out.text, { star: !out.ok });
    p.log.pop();
    p.log.splice(at, 0, entry);
    return out;
  });
  st.done.push(d.id);
  st.rngState = rng.state;
  return { title: `${d.title}：${opt.label}`, results };
}

/** おまかせ・実験室：自動で選ぶ */
export function autoChoose(st: GameState, d: DecisionDef): string {
  const rng = new Rng(st.rngState ^ 0x9e3779b9);
  const id = d.auto ? d.auto(st, rng) : d.options[0].id;
  st.rngState = (st.rngState + 1) >>> 0;
  return id;
}

export { EDU_LABEL };
