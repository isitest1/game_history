import './styles/main.css';
import { createGame, runYear, eventsForYear, survivalPercentile, survivalCurve, cohortLifeExpectancy, eduLabelOf, jobLabelAt, OLDEST, type GameState, type Focus, type YearEntry } from './sim/engine';
import { dueDecision, viewOf, applyDecision, autoChoose, ASKED } from './sim/decisions';
import * as S from './sim/stats';
import type { Person, DecisionView, DecisionResult, LogEntry } from './sim/types';
import { esc, wareki, yen, shortYen, html, sleep, reducedMotion } from './ui/format';
import { drawShareCard, shareText } from './ui/sharecard';
import { openX, birthXText, endXText, TITLE_X_TEXT, xShareText } from './ui/share';
import { HELP_LINES, SOURCES } from './ui/content';
import { sound } from './ui/sound';
import { loadEvents, eventStats } from './sim/events';
import { DAILY } from './sim/daily';
import { playToEnd } from './sim/lab';
import { DECISIONS } from './sim/decisions';
import { sceneSvg } from './ui/scene';

const app = document.getElementById('app')!;
const SAVE_KEY = 'umaredoshi.save.v1';
const PREF_KEY = 'umaredoshi.prefs.v1';
const ERA_CLASS = ['era-0', 'era-1', 'era-2'];
const ICON = {
  auto: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  dark: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>',
  light: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>',
};
const themeLabel = () => `表示の明るさを切り替える（いま：${ui.theme === 'auto' ? '端末に合わせる' : ui.theme === 'dark' ? '暗い' : '明るい'}）`;
const BREATH_AGES = [6, 15, 22, 40, 65];

interface UiPrefs {
  playerBirthYear: number | null;
  minutes: number;
  pace?: PaceId;
  theme: 'auto' | 'light' | 'dark';
  sound: boolean;
  answers: Record<string, string>;
  speed?: number;
}

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 保存できなくても遊べる */
    }
  },
  del(k: string): void {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};

const ui: UiPrefs = { playerBirthYear: null, minutes: 25, theme: 'auto', sound: false, answers: {}, ...(store.get<UiPrefs>(PREF_KEY) ?? {}) };
/** 進む速さ。1年の長さは、その年に出る文章の量で決める（読み終わるくらいの時間をとる） */
const PACES = [
  { id: 'slow', label: 'ゆっくり', msPerChar: 85 },
  { id: 'normal', label: 'ふつう', msPerChar: 55 },
  { id: 'fast', label: 'はやめ', msPerChar: 35 },
] as const;
type PaceId = (typeof PACES)[number]['id'];
if (!PACES.some((x) => x.id === ui.pace)) ui.pace = 'normal';
applyTheme();

function savePrefs(): void {
  store.set(PREF_KEY, ui);
}
function applyTheme(): void {
  if (ui.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', ui.theme);
}

// ---------- 画面の切り替え ----------

let state: GameState | null = null;
let timer: { stop: boolean } | null = null;

function topbar(extra = ''): string {
  return html`<header class="topbar">
    <a class="logo" href="./" data-act="home"><span class="seal" aria-hidden="true">生</span>生まれ年ガチャ</a>
    <div style="display:flex;gap:6px;align-items:center">
      ${extra}
      <button class="iconbtn" data-act="theme" aria-label="${themeLabel()}">${ICON[ui.theme]}</button>
      <button class="iconbtn" data-act="help">相談先</button>
    </div>
  </header>`;
}

function bindCommon(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-act="home"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      stopTimer();
      showTitle();
    }),
  );
  root.querySelector('[data-act="theme"]')?.addEventListener('click', () => {
    ui.theme = ui.theme === 'auto' ? 'dark' : ui.theme === 'dark' ? 'light' : 'auto';
    savePrefs();
    applyTheme();
    const b = root.querySelector('[data-act="theme"]') as HTMLElement;
    b.innerHTML = ICON[ui.theme];
    b.setAttribute('aria-label', themeLabel());
  });
  root.querySelector('[data-act="help"]')?.addEventListener('click', () => showHelp());
}

// ---------- タイトル ----------

function showTitle(): void {
  window.scrollTo(0, 0);
  const saved = store.get<GameState>(SAVE_KEY);
  const years = TRIPLES[0];
  const yearOpts = ['<option value="">答えない</option>']
    .concat(Array.from({ length: 2020 - 1925 + 1 }, (_, i) => 2020 - i).map((y) => `<option value="${y}" ${ui.playerBirthYear === y ? 'selected' : ''}>${y}年（${wareki(y)}）</option>`))
    .join('');
  app.innerHTML = html`${topbar()}
    <main class="wrap hero" id="main">
      <div class="hero-grid"><div>
        <p class="kicker">Born in three eras</p>
        <h1><span class="nw">同じ私が、</span><br /><span class="nw">三つの時代に</span><span class="nw"><em>生まれる</em>。</span></h1>
        <div class="triplet" aria-hidden="true">
          ${years.map((y, i) => `<div class="yr ${ERA_CLASS[i]}"><b class="yr-num" data-roll="${i}">${y}</b><span data-rk="${i}">${artLabel(y)}</span></div>`)}
        </div>
        <p class="lead">性格も、才能も、家の暮らし向きも同じ。違うのは、生まれた年と、生まれた県。あなたの決断は3人全員に当てはまります。けれど、結果を決めるのはそれぞれの時代です。進学も、就職も、結婚も、寿命も、年金も、日本の実際の統計で決まります。</p>
        ${saved && !saved.finished ? `<div class="resume"><span>途中の人生があります（${saved.age}歳）。</span><button class="btn small" data-act="resume">続きから</button></div>` : ''}
        <form class="form" id="startform">
          <div class="row">
            <div>
              <label for="pby">あなたの生まれ年</label>
              <select id="pby" name="pby">${yearOpts}</select>
            </div>
            <div>
              <span id="lenlbl" style="font-size:14px;font-weight:700;display:block;margin-bottom:6px">進む速さ</span>
              <div class="seg" role="group" aria-labelledby="lenlbl">
                ${PACES.map((x) => `<button type="button" data-pace="${x.id}" aria-pressed="${ui.pace === x.id}">${x.label}</button>`)}
              </div>
            </div>
          </div>
          <button class="btn" type="submit">ガチャを回して生まれる</button>
          <p class="muted" style="margin:0;font-size:13px">生まれ年は、最後にあなた自身と比べるためだけに使います。この端末の中にだけ保存します。</p>
        </form>
        <div class="hero-foot">
          <button data-act="sources">使った統計と出典</button>
          <button data-act="help2">つらいときの相談先</button>
          <button data-act="about">このゲームについて</button>
          <button data-act="dex">前世の記録と図鑑</button>
          <button data-act="xtitle">Xで紹介する</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${[0, 1, 2].map((i) => `<div class="art-card ${ERA_CLASS[i]}" data-art="${i}"></div>`).join('')}</div>
      </div>
      <div class="hero-bg" aria-hidden="true">${([[1850, 20], [1960, 27], [2018, 13]] as const).map(([y, pf], i) => `<div class="${ERA_CLASS[i]}">${sceneSvg(y, pf)}</div>`).join('')}</div>
    </main>
    ${titleSections()}`;
  bindCommon(app);
  // 年号がくるくる回る。右の札には、その年に生まれた人の数字を出す
  const els = app.querySelectorAll<HTMLElement>('[data-roll]');
  const arts = app.querySelectorAll<HTMLElement>('[data-art]');
  const rks = app.querySelectorAll<HTMLElement>('[data-rk]');
  const paint = (ys: readonly number[]) => {
    els.forEach((el, i) => (el.textContent = String(ys[i])));
    rks.forEach((el, i) => (el.textContent = artLabel(ys[i])));
    arts.forEach((el, i) => {
      const y = ys[i];
      const q0 = (S.qx(y, 0, 'male') + S.qx(y, 0, 'female')) / 2;
      el.innerHTML = `<span class="art-k">${artLabel(y)}</span><b class="yr-num">${y}</b><span class="art-w">${wareki(y)}生まれ</span>
        <dl><dt>生まれた赤ちゃん</dt><dd>${Math.round(S.nationalBirths(y) / 10000)}万人</dd>
        <dt>1歳まで</dt><dd>${Math.round(1 / Math.max(q0, 0.0003))}人に1人が亡くなる</dd>
        <dt>15歳で上の学校へ</dt><dd>${Math.round((S.eduRate('highSchool', y + 15, 'male') + S.eduRate('highSchool', y + 15, 'female')) / 2)}%</dd>
        <dt>見込みの寿命</dt><dd>${Math.round((cohortLifeExpectancy(y, 'male') + cohortLifeExpectancy(y, 'female')) / 2)}歳</dd></dl>`;
    });
  };
  paint(TRIPLES[0]);
  if (!reducedMotion()) {
    let n = 0;
    const iv = setInterval(() => {
      if (!document.body.contains(els[0])) return clearInterval(iv);
      n++;
      paint(TRIPLES[n % TRIPLES.length]);
    }, 6000);
  }
  app.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.pace = b.dataset.pace as PaceId;
      app.querySelectorAll('[data-pace]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      savePrefs();
    }),
  );
  startCounter();
  fillSample();
  app.querySelector('[data-act="resume"]')?.addEventListener('click', () => {
    state = saved;
    if (state) showLife();
  });
  app.querySelector('[data-act="sources"]')?.addEventListener('click', showSources);
  app.querySelector('[data-act="help2"]')?.addEventListener('click', () => showHelp());
  app.querySelector('[data-act="about"]')?.addEventListener('click', showAbout);
  app.querySelector('[data-act="dex"]')?.addEventListener('click', showDex);
  app.querySelector('[data-act="xtitle"]')?.addEventListener('click', () => openX(TITLE_X_TEXT));
  (app.querySelector('#startform') as HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (app.querySelector('#pby') as HTMLSelectElement).value;
    ui.playerBirthYear = v ? Number(v) : null;
    savePrefs();
    sound.unlock(ui.sound);
    state = createGame({ playerBirthYear: ui.playerBirthYear });
    store.set(SAVE_KEY, state);
    showGacha();
  });
}

// ---------- トップページの情報 ----------

/** トップページで順に見せる3つの生まれ年の例（江戸から平成まで。どこも30年以上離れている） */
const TRIPLES: readonly (readonly [number, number, number])[] = [
  [1850, 1925, 2000],
  [1822, 1889, 1995],
  [1868, 1946, 2005],
  [1803, 1960, 1992],
  [1912, 1955, 2010],
  [1841, 1903, 1998],
];

/** 年のそばに添える、その時代の手ざわり */
function artLabel(y: number): string {
  return y < 1872 ? '和紙と筆' : y < 1950 ? '活版と紙' : y < 1990 ? 'ブラウン管' : 'フラット';
}

/** 令和7（2025）年 人口動態統計（確定数）。厚生労働省、2026年9月30日公表 */
const VITAL_2025 = { births: 671270, deaths: 1589533, marriages: 489158 };
const SEC_PER_YEAR = 365 * 24 * 3600;

function titleSections(): string {
  const ex = [1850, 1925, 2000];
  const avg = (f: (sx: 'male' | 'female') => number) => (f('male') + f('female')) / 2;
  const cell = (v: string) => `<td>${v}</td>`;
  const rows: [string, (y: number) => string][] = [
    ['生まれた赤ちゃん', (y) => `${Math.round(S.nationalBirths(y) / 10000)}万人`],
    ['1歳になる前に亡くなる', (y) => `${Math.round(1 / Math.max(0.0003, avg((sx) => S.qx(y, 0, sx))))}人に1人`],
    ['上の学校へ進む（15歳）', (y) => `${Math.round(avg((sx) => S.eduRate('highSchool', y + 15, sx)))}%`],
    ['大学・短大へ進む（18歳）', (y) => `${Math.round(avg((sx) => S.eduRate('university', y + 18, sx) + S.eduRate('juniorCollege', y + 18, sx)))}%`],
    ['見込みの寿命', (y) => `${Math.round(avg((sx) => cohortLifeExpectancy(y, sx)))}歳`],
    ['年金をもらい始める（男性）', (y) => (y < 1891 ? 'なし（制度がない）' : y < 1911 ? '70歳（老齢福祉年金）' : `${S.pensionStartAge(y, 4, 'male')}歳`)],
  ];
  const daily = DAILY.filter((d) => d.kind === 'daily').length;
  const think = DAILY.length - daily;
  const hist = store.get<HistRec[]>(HIST_KEY) ?? [];
  return html`<section class="tsec counter-band" aria-label="いまの日本">
      <div class="wrap">
        <p class="kicker">今日、0時から今までに、日本では</p>
        <div class="counters">
          <div><b id="cBirth">0</b><span>人が生まれ</span></div>
          <div><b id="cDeath">0</b><span>人が亡くなり</span></div>
          <div><b id="cMarry">0</b><span>組が結婚しました</span></div>
        </div>
        <p class="muted small">1日に約${Math.round(VITAL_2025.births / 365).toLocaleString('ja-JP')}人が生まれ、約${Math.round(VITAL_2025.deaths / 365).toLocaleString('ja-JP')}人が亡くなっています。1949年には、1日に約${Math.round(S.nationalBirths(1949) / 365).toLocaleString('ja-JP')}人が生まれていました。<br />令和7（2025）年 人口動態統計（確定数）の年間の数を、1秒あたりにならした目安です。</p>
      </div>
    </section>
    <section class="tsec">
      <div class="wrap">
        <h2>生まれた年で、こんなに違う</h2>
        <p class="lead2">同じ日本、同じ家に生まれても、生まれた年がずれるだけで、一生の前提が変わります。</p>
        <div class="cmp-wrap"><table class="cmp3">
          <thead><tr><th></th>${ex.map((y, i) => `<th class="${ERA_CLASS[i]}"><b>${y}</b><small>${wareki(y)}生まれ</small></th>`).join('')}</tr></thead>
          <tbody>${rows.map(([k, f]) => `<tr><th>${k}</th>${ex.map((y) => cell(f(y))).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="muted small">人口動態統計・生命表・学校基本調査・年金制度の資料と、歴史人口学の研究から。1850年生まれの数字は推計で、上の学校は藩校・私塾、1925年生まれは旧制の中学校・高等女学校です。2000年生まれの寿命は国の将来推計の死亡率を使った見込みです。戦争で亡くなった人は、この寿命の計算には入っていません。</p>
      </div>
    </section>
    <section class="tsec">
      <div class="wrap">
        <h2>たとえば、今日のこんな3人</h2>
        <p class="lead2">同じ一人が、三つの時代に生まれたら。このゲームで、今日いちどだけ回した結果です。</p>
        <div class="sample3" id="sample3"><p class="muted">人生を計算しています…</p></div>
      </div>
    </section>
    <section class="tsec">
      <div class="wrap">
        <h2>このゲームの中にあるもの</h2>
        <div class="nums">
          <div><b id="nEvents">…</b><span>実際にあった出来事</span></div>
          <div><b>${daily.toLocaleString('ja-JP')}</b><span>時代ごとの日々の場面</span></div>
          <div><b>${think.toLocaleString('ja-JP')}</b><span>その人の心の声</span></div>
          <div><b>${DECISIONS.length}</b><span>人生の決断</span></div>
        </div>
        <ul class="features">
          <li><b>3人に同じ決断</b>あなたが選んだことは3人全員に当てはまります。けれど、叶うかどうかは時代が決めます。</li>
          <li><b>日本の実際の統計</b>寿命・進学・就職・結婚・賃金・物価・年金を、政府の統計で動かしています。</li>
          <li><b>日々の暮らし</b>銭湯、ファミコン、ポケベル、スマホ。時代ごとの暮らしの手ざわりと、その人が思ったことが毎年出てきます。</li>
          <li><b>最後に見比べる</b>享年、生涯年収、年金、叶わなかった望み、そして3人がそれぞれ思ったことを並べます。</li>
        </ul>
      </div>
    </section>
    ${hist.length
      ? `<section class="tsec"><div class="wrap"><h2>あなたの前世</h2><ul class="hist3">${hist
          .slice(0, 3)
          .map((r) => `<li><small>${esc(r.at)}・${r.sex === 'male' ? '男' : '女'}</small>${r.years.map((y, k) => `<span>${y}年・${S.placeShort(r.prefs?.[k] ?? r.pref, y)}生まれ ${esc(r.names[k]?.split(' ')[1] ?? '')}：享年${r.deaths[k] ?? '−'}</span>`).join('')}${r.okuri ? `<em>「${esc(r.okuri.slice(0, 60))}」</em>` : ''}</li>`)
          .join('')}</ul></div></section>`
      : ''}
    <section class="tsec data-note" aria-label="数字についての注意">
      <div class="wrap">
        <h2>数字について</h2>
        <p class="small">寿命・進学・就職・結婚・賃金・物価・年金は、日本の公的な統計から作っています。取れない年は前後の年から補っています。</p>
        <p class="small">1930年より前（明治・大正）の数字は、当時の生命表・人口動態統計・学校の統計・長期経済統計などから作った<b>概算</b>です。年ごとの値が残っていないところは前後の年から補い、一部は推計しています。戦前の賃金や物価は、いまの統計と同じ形では残っていないため、目安として見てください。</p>
        <p class="small">1890年より前（江戸後期〜明治の初め）は、国の統計がまだありません。寺の宗門人別改帳を使った歴史人口学の研究、幕府の人口調査、米の値段や賃金の研究などから作った<b>推計</b>で、地域や村によって大きな差があります。江戸時代のお金は、いまの価値に直した目安で示しています。</p>
        <p class="small">2026年より先は、国の将来推計の前提を使った見込みです。詳しくは「使った統計と出典」と、リポジトリの docs/出典一覧.md にあります。</p>
      </div>
    </section>
    <footer class="site-foot">
      <div class="wrap"><p>運営：<a href="https://margheritaworks.com/ja" target="_blank" rel="noopener">Margherita Works</a></p><span>© ${new Date().getFullYear()} Margherita Works</span></div>
    </footer>`;
}

/** 今日0時からの出生・死亡・婚姻の目安（年間の数を1秒あたりにならす） */
function startCounter(): void {
  const els = ['#cBirth', '#cDeath', '#cMarry'].map((q) => app.querySelector(q) as HTMLElement | null);
  const per = [VITAL_2025.births, VITAL_2025.deaths, VITAL_2025.marriages].map((n) => n / SEC_PER_YEAR);
  const tick = () => {
    if (!els[0] || !document.body.contains(els[0])) return;
    const now = new Date();
    const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    els.forEach((el, k) => el && (el.textContent = Math.floor(sec * per[k]).toLocaleString('ja-JP')));
    setTimeout(tick, 1000);
  };
  tick();
}

/** 今日の日付で決まる、見本の3人 */
async function fillSample(): Promise<void> {
  await loadEvents();
  const ne = app.querySelector('#nEvents');
  if (ne) ne.textContent = eventStats().total.toLocaleString('ja-JP');
  const box = app.querySelector('#sample3');
  if (!box) return;
  const day = Math.floor(Date.now() / 86400000);
  const st = playToEnd(createGame({ seed: 100000 + day }));
  const usedT = new Set<string>();
  box.innerHTML = st.persons
    .map((p, i) => {
      const kids = p.children.length;
      const fam = p.marriageAge !== undefined ? `${p.marriageAge}歳で結婚${kids ? `、子ども${kids}人` : ''}` : '結婚しなかった';
      const job = p.jobTitle || (p.age < 15 ? '' : '仕事に就かなかった');
      const ts = p.log.filter((e) => e.kind === 'think' && e.age >= 15 && !usedT.has(e.text));
      const t = ts[Math.floor(ts.length / 2)];
      if (t) usedT.add(t.text);
      return `<article class="s3 ${ERA_CLASS[i]}">
        <header><b>${p.birthYear}</b><span>${esc(p.name)}・${S.placeMid(p.pref, p.birthYear)}</span></header>
        <p class="s3-k">享年${p.deathAge}<small>${esc(p.deathCause ?? '')}</small></p>
        <p>${p.deathAge !== undefined && p.deathAge < 15 ? `${p.deathAge}歳で亡くなった。` : `${eduLabelOf(p)}。${esc(job)}。${fam}。`}</p>
        ${t ? `<p class="s3-t">${esc(t.text)}<small>${t.age}歳</small></p>` : ''}
      </article>`;
    })
    .join('');
}

// ---------- ガチャ ----------

async function showGacha(): Promise<void> {
  if (!state) return;
  void loadEvents();
  const st = state;
  window.scrollTo(0, 0);
  const steps = ['生まれる県', '性別', '家の暮らし向き', '生まれる年'];
  app.innerHTML = html`${topbar()}
    <main class="wrap gacha" id="main">
      <div class="gacha-steps" aria-hidden="true">${steps.map((s, i) => `<span class="chip" data-step="${i}">${s}</span>`)}</div>
      <ol class="ledger" id="ledger" aria-label="引いた結果"></ol>
      <div class="label" id="glabel">生まれる県</div>
      <div class="reel" id="reel" aria-live="polite">　</div>
      <div class="prob" id="gprob"></div>
      <div class="gyears" id="gyears" aria-hidden="true">${['活版と紙', 'ブラウン管', 'フラット'].map((t, i) => `<div class="yr ${ERA_CLASS[i]} wait"><b class="yr-num">？</b><span>${t}</span></div>`).join('')}</div>
      <button class="btn ghost small" id="skip">とばす</button>
    </main>`;
  bindCommon(app);
  let skip = false;
  app.querySelector('#skip')!.addEventListener('click', () => (skip = true));
  const reel = app.querySelector('#reel') as HTMLElement;
  const label = app.querySelector('#glabel') as HTMLElement;
  const prob = app.querySelector('#gprob') as HTMLElement;
  const ledger = app.querySelector('#ledger') as HTMLElement;
  const spin = async (candidates: string[], final: string, ms = 1300) => {
    reel.classList.remove('stop');
    reel.classList.add('spin');
    const t0 = performance.now();
    while (!skip && performance.now() - t0 < ms && !reducedMotion()) {
      reel.textContent = candidates[Math.floor(Math.random() * candidates.length)];
      sound.tick();
      await sleep(40 + ((performance.now() - t0) / ms) * 120);
    }
    reel.classList.remove('spin');
    reel.textContent = final;
    reel.classList.add('stop');
    sound.ding();
  };
  const addRow = (k: string, v: string, pr: string) => {
    const li = document.createElement('li');
    const per = Math.round(parseFloat(pr) * 10);
    li.innerHTML = `<span class="k">${esc(k)}</span><b>${esc(v)}</b><span class="p">${esc(pr)}<small>1000人のうち${per}人</small></span>`;
    ledger.appendChild(li);
  };
  const mark = (i: number) =>
    app.querySelectorAll('[data-step]').forEach((c, k) => {
      c.classList.toggle('done', k < i);
      c.classList.toggle('on', k === i);
      if (k === i) c.setAttribute('aria-current', 'step');
      else c.removeAttribute('aria-current');
    });
  const g = st.gacha;
  const fam = ['苦しい', 'やや苦しい', 'ふつう', 'やや豊か', '豊か'];
  mark(0);
  // 3人それぞれの生まれた県
  label.textContent = '生まれる県（3人それぞれ）';
  for (let i = 0; i < 3; i++) await spin([...S.PREFS], S.PREFS[st.persons[i].pref - 1], i === 0 ? 900 : 600);
  reel.textContent = st.persons.map((p) => S.placeMid(p.pref, p.birthYear)).join('・');
  prob.textContent = 'それぞれの生まれ年の、都道府県別の出生数で重み付け';
  addRow('生まれる県', st.persons.map((p) => S.placeMid(p.pref, p.birthYear)).join('・'), g.prefProbs ? g.prefProbs.map((x) => `${(x * 100).toFixed(1)}%`).join('・') : `${(g.prefProb * 100).toFixed(1)}%`);
  await sleep(skip ? 0 : 900);
  mark(1);
  label.textContent = '性別';
  prob.textContent = '';
  await spin(['男', '女'], st.shared.sex === 'male' ? '男' : '女', 900);
  prob.textContent = '出生の男女比から';
  addRow('性別', st.shared.sex === 'male' ? '男' : '女', `${(g.sexProb * 100).toFixed(1)}%`);
  await sleep(skip ? 0 : 800);
  mark(2);
  label.textContent = '家の暮らし向き';
  prob.textContent = '';
  await spin(fam, fam[st.shared.familyClass - 1], 900);
  prob.textContent = '5段階。どれも同じ確率';
  addRow('家の暮らし向き', fam[st.shared.familyClass - 1], '20.0%');
  await sleep(skip ? 0 : 800);
  mark(3);
  label.textContent = 'いちばん若い人の生まれ年';
  prob.textContent = '';
  const ys = Array.from({ length: 21 }, (_, i) => String(1990 + i));
  await spin(ys, String(g.years[2]), 1300);
  prob.textContent = `${g.years[2]}年に生まれたのは${(g.birthsInYear[2] / 10000).toFixed(0)}万人`;
  addRow('いちばん若い人', `${g.years[2]}年`, '1990〜2010年から');
  await sleep(skip ? 0 : 700);
  // いちばん年上の人は1800年からいちばん若い人の60年前まで、真ん中の人はそのあいだ（どこも30年以上あける）
  label.textContent = 'いちばん年上の人の生まれ年';
  prob.textContent = '';
  const olds = Array.from({ length: g.years[2] - 60 - OLDEST + 1 }, (_, i) => String(OLDEST + i));
  await spin(olds, String(g.years[0]), 1100);
  prob.textContent = `${wareki(g.years[0])}`;
  addRow('いちばん年上の人', `${g.years[0]}年`, `${OLDEST}〜${g.years[2] - 60}年から`);
  await sleep(skip ? 0 : 500);
  label.textContent = '真ん中の人の生まれ年';
  prob.textContent = '';
  const mids = Array.from({ length: g.years[2] - g.years[0] - 60 + 1 }, (_, i) => String(g.years[0] + 30 + i));
  await spin(mids, String(g.years[1]), 1000);
  prob.textContent = `${wareki(g.years[1])}`;
  addRow('真ん中の人', `${g.years[1]}年`, `${g.years[0] + 30}〜${g.years[2] - 30}年から`);
  await sleep(skip ? 150 : 900);
  mark(4);
  label.textContent = '3つの生まれ年';
  reel.textContent = '';
  prob.textContent = '';
  const gy = app.querySelector('#gyears') as HTMLElement;
  gy.innerHTML = g.years.map((y, i) => `<div class="yr ${ERA_CLASS[i]} flip" style="animation-delay:${i * 0.15}s"><b class="yr-num">${y}</b><span>${wareki(y)}</span></div>`).join('');
  gy.classList.add('show');
  await sleep(skip ? 300 : 1800);
  showBirth();
}

// ---------- 母子手帳 ----------

function showBirth(): void {
  if (!state) return;
  const st = state;
  window.scrollTo(0, 0);
  const fam = ['苦しい', 'やや苦しい', 'ふつう', 'やや豊か', '豊か'][st.shared.familyClass - 1];
  app.innerHTML = html`${topbar()}
    <main class="wrap birth" id="main">
      <p class="kicker">母子手帳</p>
      <h2 style="font-family:var(--serif);font-size:clamp(24px,5vw,36px);margin:6px 0 4px">3つの時代、3つの${st.persons.some((p) => p.birthYear < 1871) ? '土地' : '県'}に、${st.shared.sex === 'male' ? '男の子' : '女の子'}が生まれた。</h2>
      <p style="margin:0 0 6px;font-weight:700">${st.persons.map((p) => `${p.birthYear}年・${esc(S.placeName(p.pref, p.birthYear))}`).join('　／　')}</p>
      <p class="muted" style="margin:0 0 12px">家の暮らし向きは「${fam}」。才能は「${esc(st.shared.talent)}」。3人とも同じ人です。</p>
      <div class="books">
        ${st.persons.map((p, i) => birthBook(p, i))}
      </div>
      <p class="muted" style="font-size:13px;margin:-8px 0 16px">見込み寿命は、その年に生まれた人が生命表どおりに生きた場合の平均。1歳までの死亡は、その年の0歳の死亡率から。${st.persons.some((p) => p.birthYear < 1890) ? '1890年より前（江戸・明治の初め）の数字は、歴史人口学の研究などから作った推計です。' : st.persons.some((p) => p.birthYear < 1930) ? '1930年より前（明治・大正）の数字は、当時の統計から作った概算で、一部は推計です。' : ''}</p>
      <div class="birth-acts">
        <button class="btn" id="go">人生を始める</button>
        <button class="btn ghost" id="again">引き直す</button>
        <button class="btn ghost xbtn-g" id="xbirth"><span aria-hidden="true">𝕏</span> 生まれた3人をXで共有</button>
      </div>
    </main>`;
  bindCommon(app);
  app.querySelector('#go')!.addEventListener('click', () => showLife());
  app.querySelector('#xbirth')!.addEventListener('click', () => openX(birthXText(st)));
  app.querySelector('#again')!.addEventListener('click', () => {
    state = createGame({ playerBirthYear: ui.playerBirthYear });
    store.set(SAVE_KEY, state);
    showGacha();
  });
}

function birthBook(p: Person, i: number): string {
  const q0 = S.qx(p.birthYear, 0, p.sex);
  const le = cohortLifeExpectancy(p.birthYear, p.sex);
  return html`<article class="book ${ERA_CLASS[i]}">
    <span class="stamp">${['昭和', '昭和', '平成'][i] === '平成' && p.birthYear >= 2019 ? '令和' : wareki(p.birthYear).slice(0, 2)}</span>
    <div class="bk-title">母子手帳</div>
    <div class="bk-year">${p.birthYear}</div>
    <div class="bk-wareki">${wareki(p.birthYear)}${p.birthMonth}月生まれ</div>
    <div class="bk-name">${esc(p.name)}</div>
    <dl>
      <dt>家</dt><dd>${jobLabelAt(p.parentJob, p.birthYear)}</dd>
      <dt>きょうだい</dt><dd>${p.siblings}人の${p.siblings === 1 ? 'ひとりっ子' : `${p.birthOrder}番目`}</dd>
      <dt>父・母</dt><dd>${p.birthYear - p.fatherBirthYear}歳・${p.birthYear - p.motherBirthYear}歳</dd>
      <dt>この年の出生</dt><dd>${Math.round(S.nationalBirths(p.birthYear) / 10000)}万人${p.birthYear < 1899 ? '（推計）' : ''}</dd>
      <dt>1歳まで</dt><dd>${Math.round(1 / Math.max(q0, 0.0003))}人に1人が亡くなる</dd>
      <dt>見込み寿命</dt><dd>${le.toFixed(0)}歳</dd>
    </dl>
  </article>`;
}

// ---------- 人生 ----------

const FOCUS: { id: Focus; label: string; minAge: number; maxAge: number }[] = [
  { id: 'play', label: '遊ぶ', minAge: 0, maxAge: 200 },
  { id: 'study', label: '勉強', minAge: 4, maxAge: 30 },
  { id: 'friends', label: '友だち', minAge: 3, maxAge: 200 },
  { id: 'help', label: '家の手伝い', minAge: 5, maxAge: 18 },
  { id: 'sports', label: '運動', minAge: 3, maxAge: 200 },
  { id: 'work', label: '仕事', minAge: 15, maxAge: 75 },
  { id: 'family', label: '家族', minAge: 18, maxAge: 200 },
  { id: 'health', label: '健康', minAge: 40, maxAge: 200 },
];

/** 進む速さ。0.5倍・0.8倍でゆっくり読める。選んだ速さはこの端末に覚えておく */
const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 4, 8];
let speed = SPEEDS.includes(Number(ui.speed)) ? Number(ui.speed) : 1;
let paused = false;
let untilDecision = false;
let autoMode = false;
/** 画面に出している年齢（runYear のあとも、その年を見せているあいだは前の年齢のまま） */
let shownAge = 0;

/** 1年の長さ（ミリ秒）。その年に出る文章の文字数に合わせる。1倍でおよそ読み終わる長さ */
function yearMs(chars: number): number {
  const pace = PACES.find((x) => x.id === ui.pace) ?? PACES[1];
  // 1倍の基準は、2026-10-15にユーザーの指摘「1倍でも少し遅い」で1.2倍に速めた
  return (2500 + chars * pace.msPerChar) / (speed * 1.2);
}

async function showLife(): Promise<void> {
  if (!state) return;
  await loadEvents();
  const st = state;
  shownAge = st.age;
  window.scrollTo(0, 0);
  app.innerHTML = html`
    <div class="agebar">
      <div class="inner">
        <div style="display:flex;align-items:baseline;gap:10px">
          <a class="logo" href="./" data-act="home" aria-label="トップへ戻る"><span class="seal" aria-hidden="true">生</span></a>
          <div class="age" aria-live="polite"><span id="age">${st.age}</span><small>歳</small></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="statusbtn" id="statusbtn" aria-label="3人のようすを見る"><span class="sdots" aria-hidden="true"><i></i><i></i><i></i></span>3人のようす</button>
          <button class="iconbtn" data-act="theme" aria-label="${themeLabel()}">${ICON[ui.theme]}</button>
          <button class="iconbtn" data-act="help">相談先</button>
        </div>
      </div>
      <div class="yearprog"><i id="prog"></i></div>
    </div>
    <main class="life" id="main">
      <aside class="side side-l" id="sideL" aria-label="この年の日本"></aside>
      <aside class="side side-r" id="sideR" aria-label="3人のいま"></aside>
      <div class="cols">
        ${st.persons.map((p, i) => `<section class="col ${ERA_CLASS[i]}" id="col${i}" aria-label="${p.birthYear}年生まれの人生"></section>`)}
      </div>
      <div class="mfeed" id="mfeed" aria-live="polite"></div>
    </main>
    <nav class="controls" aria-label="進め方">
      <div class="inner">
        <div class="focus" role="group" aria-label="今年の重点">
          <span class="lbl">今年の重点</span>
          <span id="focusbtns" style="display:contents"></span>
        </div>
        <div class="row1">
          <div class="grp">
            <button class="iconbtn" id="pp" aria-pressed="false" aria-label="一時停止">❚❚</button>
            <span class="spdwrap">
              <button class="iconbtn" id="spd" aria-haspopup="true" aria-expanded="false">×1</button>
              <span class="spdmenu" id="spdmenu" role="radiogroup" aria-label="速さ" hidden>${SPEEDS.map((v) => `<button type="button" role="radio" data-spd="${v}" aria-checked="false">×${v}</button>`).join('')}</span>
            </span>
            <button class="iconbtn" id="kurashi" aria-label="家族とお金、思いを残す">暮らし</button>
          </div>
          <div class="grp">
            <button class="iconbtn" id="auto" aria-pressed="${autoMode}" aria-label="決断をおまかせにする">おまかせ</button>
            <button class="iconbtn" id="next" aria-label="次の決断まで進める">次の決断 ▸▸</button>
          </div>
        </div>
      </div>
    </nav>`;
  bindCommon(app);
  renderAll();
  renderFocus();
  const colsEl = app.querySelector('.cols') as HTMLElement;
  const agebarEl = app.querySelector('.agebar') as HTMLElement;
  // スマホでは、3人の欄と年齢の帯をはじめから小さくしておく。
  // スクロールの量で大きさを変えると、その分だけ下の出来事が上下に飛び、最新の年が隠れてしまうため
  const setCompact = () => {
    const on = isMobile();
    colsEl?.classList.toggle('is-compact', on);
    agebarEl?.classList.toggle('is-compact', on);
  };
  setCompact();
  window.addEventListener('resize', setCompact, { passive: true });
  // 3人の欄は、上の年齢の帯のすぐ下に貼りつける。帯の高さは端末で変わるので測って渡す
  const setBarH = () => document.documentElement.style.setProperty('--agebar-h', `${agebarEl.offsetHeight}px`);
  setBarH();
  if ('ResizeObserver' in window) new ResizeObserver(setBarH).observe(agebarEl);
  if (st.age === 0) setTimeout(() => toast('列を押すと、その人の記録が開きます。下の「今年の重点」で育ち方が変わります'), 600);
  app.querySelectorAll<HTMLElement>('.col').forEach((c, i) =>
    c.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      showLog(i);
    }),
  );
  const pp = app.querySelector('#pp') as HTMLButtonElement;
  pp.addEventListener('click', () => {
    paused = !paused;
    pp.setAttribute('aria-pressed', String(paused));
    pp.textContent = paused ? '▶' : '❚❚';
    pp.setAttribute('aria-label', paused ? '再生' : '一時停止');
  });
  // 速さ：押すと一覧が開き、一度で選べる
  const spd = app.querySelector('#spd') as HTMLButtonElement;
  const menu = app.querySelector('#spdmenu') as HTMLElement;
  const showSpeed = () => {
    spd.textContent = `×${speed}`;
    spd.setAttribute('aria-label', `速さ ×${speed}（押すと選べる）`);
    menu.querySelectorAll<HTMLButtonElement>('[data-spd]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.spd) === speed)));
  };
  const openMenu = (open: boolean) => {
    menu.hidden = !open;
    spd.setAttribute('aria-expanded', String(open));
    if (open) (menu.querySelector('[aria-checked="true"]') as HTMLButtonElement | null)?.focus();
  };
  showSpeed();
  spd.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(menu.hidden);
  });
  menu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spd]');
    if (!b) return;
    e.stopPropagation();
    speed = Number(b.dataset.spd);
    ui.speed = speed;
    savePrefs();
    showSpeed();
    openMenu(false);
    spd.focus();
  });
  menu.addEventListener('keydown', (e) => {
    const bs = Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-spd]'));
    const k = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      openMenu(false);
      spd.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      bs[Math.min(bs.length - 1, k + 1)]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      bs[Math.max(0, k - 1)]?.focus();
    }
  });
  document.addEventListener('click', () => !menu.hidden && openMenu(false));
  app.querySelector('#next')!.addEventListener('click', () => {
    untilDecision = true;
    paused = false;
    pp.setAttribute('aria-pressed', 'false');
    pp.textContent = '❚❚';
  });
  app.querySelector('#kurashi')!.addEventListener('click', () => showKurashi());
  app.querySelector('#statusbtn')!.addEventListener('click', () => showStatus());
  const auto = app.querySelector('#auto') as HTMLButtonElement;
  auto.addEventListener('click', () => {
    autoMode = !autoMode;
    auto.setAttribute('aria-pressed', String(autoMode));
  });
  loop();
}

function renderFocus(): void {
  if (!state) return;
  const st = state;
  const box = app.querySelector('#focusbtns');
  if (!box) return;
  const avail = FOCUS.filter((f) => st.age >= f.minAge && st.age <= f.maxAge);
  if (!avail.some((f) => f.id === st.focus)) st.focus = avail[0].id;
  box.innerHTML = avail.map((f) => `<button type="button" data-focus="${f.id}" aria-pressed="${st.focus === f.id}">${f.label}</button>`).join('');
  box.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((b) =>
    b.addEventListener('click', () => {
      st.focus = b.dataset.focus as Focus;
      box.querySelectorAll('[data-focus]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
}

function statusLine(p: Person): string {
  const parts: string[] = [];
  if (p.inSchool) parts.push(p.inSchool === 'univ' ? '大学生' : p.inSchool === 'junior' ? '短大生' : p.inSchool === 'high' ? '高校生' : p.age < 12 ? '小学生' : '中学生');
  else if (p.age >= 6 && p.age < 15 && !p.job) parts.push(p.age < 12 ? '小学生' : '中学生');
  if (p.job && p.job !== 'none') parts.push(p.retired ? '退職' : p.jobTitle);
  if (p.job === 'none' && p.jobTitle) parts.push(p.jobTitle);
  if (p.married) parts.push(p.spouseAlive ? '既婚' : '配偶者と死別');
  if (p.children.length) parts.push(`子${p.children.filter((c) => c.alive).length}人`);
  if (p.pensionStartAge !== undefined) parts.push('年金生活');
  if (p.movedToCity && !S.METRO.has(p.pref)) parts.push('都会暮らし');
  return parts.join('・') || (p.age < 6 ? '子ども' : '');
}

const mobileMq = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 640px)') : null;
const isMobile = () => !!mobileMq?.matches;
mobileMq?.addEventListener?.('change', () => renderAll());

/** 表示が始まるまで隠しておく、その年の出来事 */
let hiddenEntries = new Set<LogEntry>();
let freshEntries = new Set<LogEntry>();
const isShown = (e: LogEntry) => !hiddenEntries.has(e);

/** 亡くなったことを、まだ画面に出していないか */
function deathPending(p: Person): boolean {
  if (p.alive) return false;
  const d = p.log.find((e) => e.kind === 'death');
  return !!d && hiddenEntries.has(d);
}

// ---------- 画面の差分更新 ----------
// 毎回 innerHTML で作り直すと、すべての行が描き直されてチカチカする。
// 中身が変わった行だけを入れ替え、初めて出る行だけを一度だけふわっと出す。

const htmlOf = new WeakMap<Element, string>();
const tpl = document.createElement('template');

function toEl(h: string): HTMLElement {
  tpl.innerHTML = h.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

/** box の子を items の並びにそろえる。key が同じで html も同じ行は、そのまま残す */
function patch(box: Element, items: { key: string; html: string }[]): HTMLElement[] {
  const old = new Map<string, HTMLElement>();
  for (const c of Array.from(box.children)) old.set((c as HTMLElement).dataset.k ?? '', c as HTMLElement);
  const added: HTMLElement[] = [];
  let prev: Element | null = null;
  for (const it of items) {
    let el = old.get(it.key);
    old.delete(it.key);
    if (!el || htmlOf.get(el) !== it.html) {
      const n = toEl(it.html);
      n.dataset.k = it.key;
      htmlOf.set(n, it.html);
      if (el) el.replaceWith(n);
      else added.push(n);
      el = n;
    }
    const want: Element | null = prev ? prev.nextElementSibling : box.firstElementChild;
    if (want !== el) box.insertBefore(el, want);
    prev = el;
  }
  old.forEach((el) => el.remove());
  return added;
}

/** その年に初めて画面に出た記録（一度だけ、ふわっと出す） */
const entered = new WeakSet<LogEntry>();
function markEnter(root: Element, list: { el: Element | null; e: LogEntry }[]): void {
  if (reducedMotion()) return;
  for (const { el, e } of list) {
    if (!el || entered.has(e)) continue;
    entered.add(e);
    el.classList.add('enter');
  }
  void root;
}

function renderCol(i: number): void {
  if (!state) return;
  const p = state.persons[i];
  const col = app.querySelector(`#col${i}`) as HTMLElement | null;
  if (!col) return;
  const alive = p.alive || deathPending(p);
  const age = alive ? shownAge : p.deathAge ?? shownAge;
  const year = p.birthYear + age;
  const s = p.stats;
  col.classList.toggle('dead', !alive);
  if (!col.querySelector('.col-body')) col.innerHTML = `<div class="scene-slot"></div><div class="col-body"><div class="col-top"></div><ul class="feed"></ul></div>`;
  // 町並みは、絵が変わるときだけ入れ替える
  const scene = sceneSvg(year, p.pref);
  const slot = col.querySelector('.scene-slot') as HTMLElement;
  if (htmlOf.get(slot) !== scene) {
    slot.innerHTML = scene;
    htmlOf.set(slot, scene);
  }
  const nm1 = esc(p.name.split(' ')[1] ?? p.name);
  const slots: Record<string, string> = {
    head: `<div class="col-head"><span class="yr-num">${year}</span><span class="wa">${wareki(year)}</span></div>`,
    who: `<div class="who"><span class="nm">${esc(p.name)}</span><span class="st">${S.placeMid(p.pref, p.birthYear)}生まれ・${esc(statusLine(p))}</span></div>`,
    state: !alive
      ? `<div class="tomb"><div class="line">${p.birthYear}–${p.deathYear}</div><div class="kyonen">享年${p.deathAge}</div><div class="line">${esc(p.deathCause ?? '')}</div></div>`
      : `<div class="bars" role="img"><span class="b" title="健康"><em>健康</em><span class="bar"><i></i></span></span><span class="b" title="幸福"><em>幸福</em><span class="bar"><i></i></span></span><span class="b" title="知識"><em>知識</em><span class="bar"><i></i></span></span><span class="b" title="人間関係"><em>関係</em><span class="bar"><i></i></span></span></div>`,
    money: alive ? `<div class="money"><span>${p.money < 0 ? 'ローン' : '貯え'}</span><b>${yen(Math.abs(p.money))}</b></div>` : '',
    inc: alive ? (p.income > 0 && !p.retired ? `<div class="money inc"><span>年収</span><b>${yen(p.income)}</b></div>` : p.pensionMonthly ? `<div class="money inc"><span>年金</span><b>月${yen(p.pensionMonthly)}</b></div>` : '') : '',
    mini: `<div class="mini" aria-hidden="true"><b>${nm1}</b><span>${alive ? `${p.money < 0 ? '借金' : '貯え'}${shortYen(Math.abs(p.money))}` : esc(p.deathCause ?? '')}</span></div>`,
  };
  const topEl = col.querySelector('.col-top') as HTMLElement;
  if (!topEl.children.length) topEl.innerHTML = Object.keys(slots).map((k) => `<div class="slot" data-slot="${k}"></div>`).join('');
  for (const [k, h] of Object.entries(slots)) {
    const el = topEl.querySelector(`[data-slot="${k}"]`) as HTMLElement;
    if (htmlOf.get(el) !== h) {
      el.innerHTML = h;
      htmlOf.set(el, h);
    }
  }
  // 棒は作り直さず、長さだけを変える（なめらかに伸び縮みする）
  const bars = topEl.querySelectorAll<HTMLElement>('.bar i');
  if (bars.length === 4) {
    [s.health, s.happiness, s.knowledge, s.relation].forEach((v, k) => (bars[k].style.width = `${v}%`));
    topEl.querySelector('.bars')?.setAttribute('aria-label', `健康${Math.round(s.health)}、幸福${Math.round(s.happiness)}、知識${Math.round(s.knowledge)}、人間関係${Math.round(s.relation)}`);
  }
  const feed = col.querySelector('.feed') as HTMLElement;
  const entries = isMobile() ? [] : p.log.filter(isShown).slice(-6).reverse();
  const keyOf = (e: LogEntry) => `e${p.log.indexOf(e)}`;
  patch(feed, entries.map((e) => ({ key: keyOf(e), html: feedItem(e, false) })));
  markEnter(feed, entries.map((e) => ({ el: feed.querySelector(`[data-k="${keyOf(e)}"]`), e })));
}

/** スマホ：3人を縦3列に並べる。上の見出し（名前・生まれ年・いまの年）は貼りつけ、どの列が誰かを分かるようにする */
function renderMFeed(): void {
  if (!state) return;
  const box = app.querySelector('#mfeed') as HTMLElement | null;
  if (!box) return;
  if (!isMobile()) {
    if (box.firstChild) box.replaceChildren();
    return;
  }
  const st = state;
  if (!box.querySelector('.mcolhead')) box.innerHTML = '<div class="mcolhead"></div><div class="mrows"></div>';
  // 見出し：押すと、その人のくわしい様子が開く
  const head = st.persons
    .map((p, i) => {
      const alive = p.alive || deathPending(p);
      const age = alive ? shownAge : p.deathAge ?? shownAge;
      return `<button type="button" class="mch ${ERA_CLASS[i]}${alive ? '' : ' dead'}" data-who="${i}" aria-label="${esc(p.name)}のようすを見る"><b>${esc(p.name.split(' ')[1] ?? p.name)}</b><span>${p.birthYear}年・${S.placeShort(p.pref, p.birthYear)}</span><small>${alive ? `${p.birthYear + age}年・${age}歳` : `享年${p.deathAge}`}</small></button>`;
    })
    .join('');
  setIfChanged(box.querySelector('.mcolhead'), head);

  const rows: { e: LogEntry; i: number }[] = [];
  st.persons.forEach((p, i) => p.log.filter(isShown).forEach((e) => rows.push({ e, i })));
  const ages = [...new Set(rows.map((r) => r.e.age))].sort((a, b) => b - a).slice(0, 4);
  const shownNow: { key: string; e: LogEntry }[] = [];
  const sections = ages.map((age) => {
    const gone = st.persons.filter((p) => p.deathAge !== undefined && p.deathAge < age && !deathPending(p)).map((p) => `${esc(p.name.split(' ')[1] ?? '')}は${p.deathAge}歳で死去`);
    const h = `<h3 class="mage">${age}歳${gone.length ? `<small>${gone.join('・')}</small>` : ''}</h3>`;
    const cells = st.persons.map((p, i) => {
      const es = rows.filter((r) => r.i === i && r.e.age === age).map((r) => r.e);
      const year = p.birthYear + age;
      const dead = p.deathAge !== undefined && p.deathAge < age && !deathPending(p);
      if (dead) return { key: `p${i}`, html: `<div class="mcell ${ERA_CLASS[i]} gone"><span class="myr">${year}</span><p class="d">—</p></div>` };
      if (!es.length) return { key: `p${i}`, html: `<div class="mcell ${ERA_CLASS[i]} empty"><span class="myr">${year}</span><p class="d">特に記録なし</p></div>` };
      // その年のことは全部出す。大事な出来事を先に、心の声を最後に
      const rank = (e: LogEntry) => KIND_RANK[e.kind] ?? 5;
      const inner = [...es]
        .sort((x, y) => rank(x) - rank(y))
        .map((e) => {
          const key = `${i}:${age}:${p.log.indexOf(e)}`;
          shownNow.push({ key, e });
          const cls = [`k-${e.kind}`, e.kind === 'wish' ? 'wish' : '', e.kind === 'decision' || e.kind === 'wish' ? 'dec' : '', e.kind === 'death' ? 'death' : '', e.heavy ? 'heavy' : ''].join(' ');
          const plain = e.kind === 'daily' || e.kind === 'think';
          return `<div class="ment ${cls}" data-key="${key}">${plain ? '' : `<b class="t">${esc(e.title)}</b>`}<span class="d">${esc(e.text)}</span>${e.heavy ? '<button class="help-note" data-act="helpnote">相談先</button>' : ''}</div>`;
        })
        .join('');
      return { key: `p${i}`, html: `<div class="mcell ${ERA_CLASS[i]}"><span class="myr">${year}</span>${inner}</div>` };
    });
    return { age, h, cells };
  });
  const rowsEl = box.querySelector('.mrows')!;
  patch(rowsEl, sections.map((sec) => ({ key: `a${sec.age}`, html: `<section class="mrow"><div class="mhead"></div><div class="mgrid"></div></section>` })));
  for (const sec of sections) {
    const el = rowsEl.querySelector(`[data-k="a${sec.age}"]`)!;
    setIfChanged(el.querySelector('.mhead'), sec.h);
    patch(el.querySelector('.mgrid')!, sec.cells);
  }
  markEnter(rowsEl, shownNow.map(({ key, e }) => ({ el: rowsEl.querySelector(`.ment[data-key="${key}"]`), e })));
  if (!box.dataset.bound) {
    box.dataset.bound = '1';
    box.addEventListener('click', (ev) => {
      const w = (ev.target as HTMLElement).closest<HTMLElement>('[data-who]');
      if (w) {
        ev.stopPropagation();
        showStatus(Number(w.dataset.who));
      }
    });
  }
}

/** スマホで全文を開いている出来事 */
const openKeys = new Set<string>();

function renderAll(): void {
  state?.persons.forEach((_, i) => renderCol(i));
  renderMFeed();
  renderSides();
}

// ---------- 広い画面の左右（この年の日本／3人のいま） ----------

const wideMq = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 1360px)') : null;
wideMq?.addEventListener?.('change', () => renderSides());

function setIfChanged(el: Element | null, h: string): void {
  if (el && htmlOf.get(el) !== h) {
    el.innerHTML = h;
    htmlOf.set(el, h);
  }
}

/** その年の日本の数字。統計のない未来の年は、出さずにそう書く */
function yearFacts(p: Person, year: number): string {
  const sx = p.sex;
  const pct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`;
  const rows: [string, string][] = [];
  const sxw = sx === 'male' ? '男' : '女';
  if (year <= 2005) rows.push([year < 1899 ? '生まれた赤ちゃん（推計）' : '生まれた赤ちゃん', `${Math.round(S.nationalBirths(year) / 10000)}万人`]);
  // 2025年：人口動態統計（確定数）671,270人（厚生労働省、2026年9月30日公表）
  if (year === 2025) rows.push(['生まれた赤ちゃん', '67万人']);
  if (year < 1890) {
    // 江戸・明治の初め：推計の数字だけを出す（失業率・求人倍率の統計はまだない）
    rows.push([year < 1873 ? '手習いを受ける子（推計）' : '小学校の就学率', `${pct(S.elementaryEnrollment(year, sx))}（${sxw}）`]);
    if (year < 1872) rows.push(['人口のうち武士（推計）', pct(S.samuraiShare(year))]);
    rows.push(['働く人のうち農業（推計）', pct(S.primaryShare(year))]);
    rows.push(['初婚年齢（推計）', `${S.meanMarriageAge(year, sx).toFixed(1)}歳（${sxw}）`]);
    if (year >= 1871) rows.push(['当時の1円は、2020年の（推計）', `${(Math.round(S.toReal2020(year) / 100) * 100).toLocaleString('ja-JP')}円`]);
  } else if (year <= 2025) {
    rows.push(['大学へ進む割合', `${pct(S.eduRate('university', year, sx))}（${sxw}）`]);
    if (year >= 1930) rows.push(['完全失業率', pct(S.unemployment(year))]);
    if (year >= 1963) rows.push(['有効求人倍率', `${S.jobOpenings(year).toFixed(2)}倍`]);
    rows.push(['平均初婚年齢', `${S.meanMarriageAge(year, sx).toFixed(1)}歳（${sxw}）`]);
    rows.push(['当時の1万円は、2020年の', `${(Math.round((10000 * S.toReal2020(year)) / 100) * 100).toLocaleString('ja-JP')}円`]);
  }
  const future = year > 2025;
  // この年の出来事：その年に始まった全国・制度・文化・戦争の出来事と、その県の出来事
  const order: Record<string, number> = { pref: 0, national: 1, war: 1, system: 2, culture: 3 };
  const evs = eventsForYear(year)
    .filter((e) => e.year === year && e.category in order && (!e.prefs || e.prefs.includes(p.pref)))
    .sort((a, b) => order[a.category] - order[b.category])
    .filter((e, k, arr) => arr.findIndex((x) => x.title === e.title) === k)
    .slice(0, 5);
  const evHtml = evs.length
    ? `<h5 class="yev-h">この年の出来事</h5><ul class="yev">${evs.map((e) => `<li class="${e.category === 'pref' ? 'local' : ''}">${e.category === 'pref' ? `<span class="tag">${S.placeShort(p.pref, year)}</span>` : ''}${esc(e.title)}${e.month ? `<small>${e.month}月</small>` : ''}</li>`).join('')}</ul>`
    : '';
  return html`<section class="yfact ${ERA_CLASS[p.era]}">
    <h4><b>${year}</b><span>${wareki(year)}</span>${future ? '<em>この先は推計</em>' : ''}</h4>
    ${future
      ? '<p class="muted">2026年より先の統計はまだありません。ゲームでは、2025年ごろの値や、国の推計の前提を使っています。</p>'
      : `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`}
    ${evHtml}
  </section>`;
}

function personNow(p: Person, i: number, age: number): string {
  const year = p.birthYear + age;
  const alive = p.alive || deathPending(p);
  const nm = esc(p.name.split(' ')[1] ?? p.name);
  if (!alive) {
    return `<section class="pnow ${ERA_CLASS[i]} dead"><h4>${nm}<span>${p.birthYear}–${p.deathYear}</span></h4><p>享年${p.deathAge}。${esc(p.deathCause ?? '')}。</p></section>`;
  }
  const fam: string[] = [];
  const pa = (by: number) => year - by;
  fam.push(`父：${p.fatherAlive ? `${pa(p.fatherBirthYear)}歳` : '亡くなった'}`);
  fam.push(`母：${p.motherAlive ? `${pa(p.motherBirthYear)}歳` : '亡くなった'}`);
  if (p.married) fam.push(`${p.sex === 'male' ? '妻' : '夫'}：${p.spouseAlive ? esc(p.spouseName ?? 'いる') : '先に亡くなった'}`);
  const kids = p.children.filter((c) => c.alive && c.birthYear <= year);
  if (kids.length) fam.push(`子：${kids.map((c) => `${esc(c.name ?? '')}（${year - c.birthYear}歳）`).join('、')}`);
  if (p.friendName && (p.friendSince ?? 99) <= age) fam.push(`親友：${esc(p.friendName)}${p.friendLost ? '（疎遠）' : ''}`);
  if (p.pet && p.pet.since <= age) fam.push(`${p.pet.kind === 'dog' ? '犬' : '猫'}：${esc(p.pet.name)}${p.pet.alive ? '' : '（見送った）'}`);
  const thought = [...p.log].reverse().find((e) => e.kind === 'think' && isShown(e));
  return html`<section class="pnow ${ERA_CLASS[i]}">
    <h4>${nm}<span>${esc(statusLine(p))}</span></h4>
    <ul class="fam">${fam.map((f) => `<li>${f}</li>`).join('')}</ul>
    ${thought ? `<p class="lastthink">${esc(thought.text)}<small>${thought.age}歳</small></p>` : ''}
    <div class="lifemap"><small>人生地図（1マス1年、濃いほど幸せだった年）</small>${lifeMapRow(p, i)}</div>
  </section>`;
}

/** スマホなど：上の「3人のようす」で開く、くわしい今の状態 */
function personDetail(p: Person, i: number, age: number): string {
  const year = p.birthYear + age;
  const alive = p.alive || deathPending(p);
  const nm = esc(p.name);
  if (!alive) {
    return html`<div class="pd ${ERA_CLASS[i]}">
      <div class="pd-head"><b>${p.birthYear}–${p.deathYear}</b><span>${nm}</span></div>
      <p class="pd-kyonen">享年${p.deathAge}<small>${esc(p.deathCause ?? '')}</small></p>
      <dl class="pd-dl"><dt>学歴</dt><dd>${eduLabelOf(p)}</dd><dt>仕事</dt><dd>${esc(p.jobTitle || 'なし')}</dd><dt>生涯年収</dt><dd>${yen(p.lifetimeEarningsReal)}（今の価値）</dd></dl>
      <div class="lifemap"><small>人生地図（1マス1年、濃いほど幸せだった年）</small>${lifeMapRow(p, i)}</div>
    </div>`;
  }
  const s = p.stats;
  const bar = (k: string, v: number) => `<div class="pd-bar"><span>${k}</span><span class="bar"><i style="width:${v}%"></i></span><b>${Math.round(v)}</b></div>`;
  const pa = (by: number) => year - by;
  const fam: string[] = [];
  fam.push(`父　${p.fatherAlive ? `${pa(p.fatherBirthYear)}歳` : '亡くなった'}`);
  fam.push(`母　${p.motherAlive ? `${pa(p.motherBirthYear)}歳` : '亡くなった'}`);
  if (p.siblings > 1) fam.push(`きょうだい　${p.siblings}人の${p.birthOrder === 1 ? '長子' : `${p.birthOrder}番目`}`);
  if (p.married) fam.push(`${p.sex === 'male' ? '妻' : '夫'}　${p.spouseAlive ? esc(p.spouseName ?? 'いる') : '先に亡くなった'}${p.marriageAge !== undefined ? `（${p.marriageAge}歳で${p.marriageType ?? ''}結婚）` : ''}`);
  const kids = p.children.filter((c) => c.birthYear <= year);
  if (kids.length) fam.push(`子　${kids.map((c) => `${esc(c.name ?? '')}${c.alive ? `（${year - c.birthYear}歳）` : '（亡くなった）'}`).join('、')}`);
  if (p.friendName && (p.friendSince ?? 99) <= age) fam.push(`親友　${esc(p.friendName)}${p.friendLost ? '（いまは疎遠）' : ''}`);
  if (p.pet && p.pet.since <= age) fam.push(`${p.pet.kind === 'dog' ? '犬' : '猫'}　${esc(p.pet.name)}${p.pet.alive ? '' : '（見送った）'}`);
  const thoughts = p.log.filter((e) => e.kind === 'think' && isShown(e)).slice(-2).reverse();
  const miss = p.wishes.filter((w) => !w.ok);
  return html`<div class="pd ${ERA_CLASS[i]}">
    <div class="pd-head"><b>${year}</b><span>${wareki(year)}・${age}歳・${S.placeName(p.pref, p.birthYear)}生まれ</span></div>
    <p class="pd-name">${nm}<small>${esc(statusLine(p))}</small></p>
    <div class="pd-bars">${bar('健康', s.health)}${bar('幸福', s.happiness)}${bar('知識', s.knowledge)}${bar('人間関係', s.relation)}</div>
    <dl class="pd-dl">
      <dt>学歴</dt><dd>${p.inSchool ? '在学中' : eduLabelOf(p)}</dd>
      <dt>仕事</dt><dd>${esc(p.jobTitle || (p.retired ? '退職した' : 'なし'))}</dd>
      <dt>${p.money < 0 ? 'ローン' : '貯え'}</dt><dd>${yen(Math.abs(p.money))}</dd>
      ${p.income > 0 && !p.retired ? `<dt>年収</dt><dd>${yen(p.income)}</dd>` : ''}
      ${p.pensionMonthly ? `<dt>年金</dt><dd>月${yen(p.pensionMonthly)}</dd>` : ''}
      <dt>これまでの稼ぎ</dt><dd>${yen(p.lifetimeEarningsReal)}（今の価値）</dd>
    </dl>
    <h5>家族と身近な人</h5>
    <ul class="pd-fam">${fam.map((f) => `<li>${f}</li>`).join('')}</ul>
    ${thoughts.length ? `<h5>最近思ったこと</h5>${thoughts.map((t) => `<p class="lastthink">${esc(t.text)}<small>${t.age}歳</small></p>`).join('')}` : ''}
    ${miss.length ? `<h5>叶わなかった望み</h5><ul class="pd-fam">${miss.map((w) => `<li>${w.age}歳　${esc(w.wish)}<small>→ ${esc(w.result)}</small></li>`).join('')}</ul>` : ''}
    <div class="lifemap"><small>人生地図（1マス1年、濃いほど幸せだった年）</small>${lifeMapRow(p, i)}</div>
    <h5>この年の日本</h5>
    ${yearFacts(p, year)}
  </div>`;
}

function showStatus(start = 0): void {
  if (!state) return;
  const st = state;
  const ages = st.persons.map((p) => (p.alive || deathPending(p) ? shownAge : p.deathAge ?? shownAge));
  const render = (k: number, dir = 0) => html`<div class="status-sheet">
    <div class="tabs" role="tablist">${st.persons.map((q, j) => `<button class="stab ${ERA_CLASS[j]}" role="tab" aria-selected="${j === k}" data-tab="${j}"><b>${esc(q.name.split(' ')[1] ?? '')}</b><small>${q.birthYear}年</small></button>`)}</div>
    <p class="swipe-hint">左右にスワイプで切り替え</p>
    <div class="pd-wrap${dir ? (dir > 0 ? ' from-r' : ' from-l') : ''}">${personDetail(st.persons[k], k, ages[k])}</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn small ghost" data-log="${k}">この人の記録をすべて見る</button><button class="btn small" data-close>閉じる</button></div>
  </div>`;
  // 見ているあいだは止めておく
  const wasPaused = paused;
  paused = true;
  const { el, close: close0 } = sheet(render(start), { label: '3人のようす', dismiss: true });
  const close = () => {
    close0();
    paused = wasPaused;
  };
  el.addEventListener('click', (e) => (e.target === el || (e.target as HTMLElement).closest('[data-x]')) && (paused = wasPaused));
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    paused = wasPaused;
    document.removeEventListener('keydown', onEsc);
  };
  document.addEventListener('keydown', onEsc);
  let cur = start;
  const bind = (k: number, dir = 0) => {
    cur = k;
    const box = el.querySelector('.sheet')!;
    box.innerHTML = '<button class="sheet-x" data-x aria-label="閉じる">×</button>' + render(k, dir);
    box.scrollTop = 0;
    box.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => bind(Number(b.dataset.tab), Math.sign(Number(b.dataset.tab) - cur))));
    box.querySelector('[data-close]')!.addEventListener('click', close);
    box.querySelector('[data-log]')!.addEventListener('click', () => {
      close();
      showLog(k);
    });
  };
  bind(start);
  // 左右にスワイプして、人を切り替える
  const sh = el.querySelector('.sheet') as HTMLElement;
  let x0 = 0;
  let y0 = 0;
  sh.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  sh.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const n = st.persons.length;
    if (dx < 0) bind((cur + 1) % n, 1);
    else bind((cur + n - 1) % n, -1);
  }, { passive: true });
}

function renderSides(): void {
  const L = app.querySelector('#sideL');
  const R = app.querySelector('#sideR');
  if (!state || !L || !R) return;
  if (!wideMq?.matches) {
    setIfChanged(L, '');
    setIfChanged(R, '');
    return;
  }
  const st = state;
  const ages = st.persons.map((p) => (p.alive || deathPending(p) ? shownAge : p.deathAge ?? shownAge));
  setIfChanged(L, `<h3>この年の日本</h3>${st.persons.map((p, i) => yearFacts(p, p.birthYear + ages[i])).join('')}<p class="src-note">人口動態統計・学校基本調査・労働力調査・消費者物価指数ほか（出典は「使った統計と出典」）</p>`);
  setIfChanged(R, `<h3>3人のいま</h3>${st.persons.map((p, i) => personNow(p, i, ages[i])).join('')}`);
}

/** スマホで1人につき1件だけ出すときの、大事さの順（小さいほど先） */
const KIND_RANK: Partial<Record<LogEntry['kind'], number>> = { death: 0, decision: 1, wish: 1, birth: 1, family: 2, work: 2, school: 2, pension: 2, event: 3, health: 4, money: 4, daily: 5, note: 5, think: 6 };

function feedItem(e: LogEntry, old: boolean): string {
  const cls = [`k-${e.kind}`, e.kind === 'wish' ? 'wish' : '', e.kind === 'decision' || e.kind === 'wish' ? 'dec' : '', e.kind === 'death' ? 'death' : '', e.heavy ? 'heavy' : '', old ? 'old' : ''].join(' ');
  return html`<li class="${cls}">
    <span class="meta">${e.age}歳・${e.year}年</span>
    <span class="t">${esc(e.title)}</span>
    <span class="d">${esc(e.text)}</span>
    ${e.heavy ? `<button class="help-note" data-act="helpnote">つらいときの相談先</button>` : ''}
  </li>`;
}

function stopTimer(): void {
  if (timer) timer.stop = true;
  timer = null;
}

async function loop(): Promise<void> {
  stopTimer();
  const me = { stop: false };
  timer = me;
  app.addEventListener('click', helpNoteHandler);
  while (state && !me.stop) {
    const st = state;
    if (st.finished) {
      store.set(SAVE_KEY, st);
      await sleep(900);
      if (!me.stop) showEnd();
      return;
    }
    shownAge = st.age;
    const ageEl0 = app.querySelector('#age');
    if (ageEl0) ageEl0.textContent = String(st.age);
    // 決断。人生の分かれ道になるものだけを聞き、ほかは聞かずに決めて記録に残す
    // （「ひと息」の問いかけは、読んでいる途中にじゃまになるので出さない。2026-10-15）
    let d = dueDecision(st);
    while (d && !me.stop) {
      const view = viewOf(st, d);
      const ask = !autoMode && ASKED.has(d.id);
      let choice: string;
      if (!ask) choice = autoChoose(st, d);
      else {
        untilDecision = false;
        choice = await askDecision(view);
      }
      const res = applyDecision(st, d.id, choice);
      renderAll();
      if (ask) await showResult(view, res);
      d = dueDecision(st);
    }
    if (me.stop) return;
    // 1年を進める
    const entries = runYear(st);
    store.set(SAVE_KEY, st);
    await playYear(st, entries, me);
    renderFocus();
  }
}

function helpNoteHandler(e: Event): void {
  const t = e.target as HTMLElement;
  if (t.closest('[data-act="helpnote"]')) {
    e.stopPropagation();
    showHelp();
  }
}

async function playYear(st: GameState, entries: YearEntry[], me: { stop: boolean }): Promise<void> {
  const ageEl = app.querySelector('#age');
  const prog = app.querySelector('#prog') as HTMLElement | null;
  shownAge = st.age - 1;
  if (ageEl) ageEl.textContent = String(shownAge);
  // その年のことは、年の初めにまとめて出す（少しずつ出すと読みにくい）。
  // 1年の長さは文章の量で決める。速さや「次の決断」は、年の途中でもすぐに効く
  const chars = entries.reduce((n, x) => n + x.entry.text.length + (x.entry.title?.length ?? 0), 0);
  const durNow = () => (untilDecision || autoMode ? 120 : yearMs(chars));
  let idx = entries.length;
  hiddenEntries = new Set();
  freshEntries = new Set(entries.map((x) => x.entry));
  if (entries.some((x) => x.entry.kind === 'death')) sound.bell();
  renderAll();
  let t = 0;
  let last = performance.now();
  while (!me.stop) {
    const now = performance.now();
    if (!paused) t = Math.min(1, t + (now - last) / durNow());
    last = now;
    if (prog) prog.style.transform = `scaleX(${t})`;
    let changed = false;
    while (idx < entries.length && entries[idx].t <= t) {
      const x = entries[idx];
      hiddenEntries.delete(x.entry);
      freshEntries.add(x.entry);
      if (x.entry.kind === 'death') sound.bell();
      idx++;
      changed = true;
    }
    if (changed) renderAll();
    if (t >= 1) break;
    await sleep(untilDecision || autoMode ? 16 : 50);
  }
  hiddenEntries = new Set();
  renderAll();
}

// ---------- 重ねる画面 ----------

function sheet(inner: string, opts: { label: string; dismiss?: boolean } = { label: '' }): { el: HTMLElement; close: () => void } {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label)}">${opts.dismiss ? '<button class="sheet-x" data-x aria-label="閉じる">×</button>' : ''}${inner}</div>`;
  document.body.appendChild(back);
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismiss) close();
  };
  document.addEventListener('keydown', onKey);
  if (opts.dismiss) {
    back.addEventListener('click', (e) => e.target === back && close());
    back.addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-x]') && close());
  }
  // 最初のフォーカスは見出しに置く（選択肢に枠が付いて「選んである」ように見えないように）
  const h = back.querySelector<HTMLElement>('h2');
  if (h) h.setAttribute('tabindex', '-1');
  setTimeout(() => (h ?? back.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }), 30);
  return { el: back, close };
}

function askDecision(v: DecisionView): Promise<string> {
  const st = state!;
  return new Promise((resolve) => {
    sound.ding();
    const { el, close } = sheet(
      html`<p class="kicker">決断　${v.age}歳</p>
        <h2>${esc(v.title)}</h2>
        <p class="prompt">${esc(v.prompt)}</p>
        <div class="ev3">
          ${st.persons.map((p, i) => `<div class="${ERA_CLASS[i]} ${p.alive && !v.evidence[i].startsWith('この人') ? '' : 'na is-na'}"><b>${p.birthYear + v.age}年</b>${p.alive ? esc(v.evidence[i]) : `${p.deathAge}歳で亡くなっている`}</div>`)}
        </div>
        <div class="opts">
          ${v.options.map((o) => {
            const blocked = o.availability.filter((a, i) => st.persons[i].alive && !a.ok).length;
            const aliveN = st.persons.filter((p) => p.alive).length;
            const all = blocked === aliveN;
            const reasons = o.availability
              .map((a, i) => (st.persons[i].alive && a.reason ? `<span class="${ERA_CLASS[i]}">${st.persons[i].birthYear + v.age}年：${a.ok ? '' : '選べない。'}${esc(a.reason)}</span>` : ''))
              .join('');
            return `<button class="opt" data-opt="${o.id}" ${all ? 'disabled' : ''}><span class="ol">${esc(o.label)}</span>${reasons ? `<span class="why">${reasons}</span>` : ''}</button>`;
          })}
        </div>`,
      { label: `決断：${v.title}` },
    );
    el.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        resolve(b.dataset.opt!);
      }),
    );
  });
}

function showResult(v: DecisionView, r: DecisionResult): Promise<void> {
  const st = state!;
  return new Promise((resolve) => {
    const { el, close } = sheet(
      html`<p class="kicker">同じ選択、3つの結果</p>
        <h2>${esc(r.title)}</h2>
        <div class="res3">
          ${r.results.map((x, i) => {
            const p = st.persons[i];
            if (!x) return `<div class="${ERA_CLASS[i]} na is-na"><span class="mark">${p.birthYear + v.age}年</span>${p.alive ? esc(v.evidence[i]) : `${p.deathAge}歳で亡くなっている`}</div>`;
            return `<div class="${ERA_CLASS[i]} ${x.ok ? 'ok' : 'ng'}"><span class="hanko" aria-hidden="true">${x.ok ? '叶' : '否'}</span><span class="mark">${p.birthYear + v.age}年　${x.ok ? '叶った' : '叶わなかった'}</span>${esc(x.text)}</div>`;
          })}
        </div>
        <div class="actions"><button class="btn cont" id="cont">続ける</button></div>`,
      { label: '決断の結果' },
    );
    el.querySelector('#cont')!.addEventListener('click', () => {
      close();
      resolve();
    });
  });
}

/** ひと息で並べる数字。年齢ごとに、その年齢で意味のある統計を出す */
function breathStat(birthYear: number, sex: 'male' | 'female', age: number): string {
  const y = birthYear + age;
  if (age === 6) return `同い年の子は約${Math.round(S.nationalBirths(birthYear) / 10000)}万人`;
  if (age === 15) return `高校進学率 ${Math.round(S.eduRate('highSchool', y, sex))}%`;
  if (age === 22) return `大学進学率 ${Math.round(S.eduRate('university', birthYear + 18, sex))}%`;
  if (age === 40) return y > 2025 ? '完全失業率 推計なし' : `完全失業率 ${S.unemployment(y).toFixed(1)}%`;
  if (age === 65) return `厚生年金の支給開始 ${S.pensionStartAge(birthYear, 6, sex)}歳`;
  return '';
}

const BREATH_Q: Record<number, string> = {
  6: '6歳のころ、いちばん覚えていることは何ですか。',
  15: '15歳のとき、何になりたかったですか。',
  22: '22歳のとき、どこで、何をしていましたか（していると思いますか）。',
  40: '40歳のあなたは、何を大事にしていますか（していると思いますか）。',
  65: '65歳になったら、何をしていたいですか。',
};

function showBreather(age: number): Promise<void> {
  const st = state!;
  return new Promise((resolve) => {
    const py = ui.playerBirthYear;
    const yourYear = py ? py + age : null;
    const { el, close } = sheet(
      html`<p class="kicker">ひと息　${age}歳</p>
        <h2>${age}歳の3人と、あなた</h2>
        <div class="cmp" style="${ui.playerBirthYear ? '' : 'grid-template-columns:repeat(3,minmax(0,1fr))'}">
          ${st.persons.map((p, i) => `<div class="${ERA_CLASS[i]}"><b>${p.birthYear + age}年</b>${p.alive ? esc(statusLine(p) || `${age}歳`) : `享年${p.deathAge}`}<br /><span class="bstat">${esc(breathStat(p.birthYear, p.sex, age))}</span></div>`)}
          ${yourYear ? `<div class="you"><b>${yourYear}年</b>${yourYear > 2026 ? 'あなたのこれから' : 'あなた'}<br /><span class="bstat">${esc(breathStat(py!, st.shared.sex, age))}</span></div>` : ''}
        </div>
        <div class="breather">
          <label for="ans" style="font-weight:700;display:block;margin-bottom:6px">${esc(BREATH_Q[age])}</label>
          <textarea id="ans" placeholder="書かなくても進めます。この端末の中にだけ残ります。">${esc(ui.answers[String(age)] ?? '')}</textarea>
        </div>
        <div class="actions" style="margin-top:12px"><button class="btn cont" id="cont">続ける</button></div>`,
      { label: `ひと息 ${age}歳` },
    );
    el.querySelector('#cont')!.addEventListener('click', () => {
      ui.answers[String(age)] = (el.querySelector('#ans') as HTMLTextAreaElement).value.slice(0, 500);
      savePrefs();
      close();
      resolve();
    });
  });
}

function showLog(i: number): void {
  const st = state!;
  const render = (k: number) => {
    const p = st.persons[k];
    return html`<div class="logwrap ${ERA_CLASS[k]}"><div class="tabs" role="tablist">${st.persons.map((q, j) => `<button class="btn small ${j === k ? '' : 'ghost'}" role="tab" aria-selected="${j === k}" data-tab="${j}">${q.birthYear}年</button>`)}</div>
      <h2>${esc(p.name)}の記録</h2>
      <p class="muted" style="margin-top:0">☆を押すと、走馬灯に残ります。</p>
      <ul class="logfull">
        ${p.log
          .map((e, idx) => ({ e, idx }))
          .reverse()
          .map(
            ({ e, idx }) =>
              `<li class="k-${e.kind}"><span class="a">${e.age}歳<br /><span class="muted" style="font-weight:400">${e.year}</span></span><span><b>${esc(e.title)}</b><button class="star" data-star="${idx}" aria-pressed="${!!e.star}" aria-label="☆を付ける">${e.star ? '★' : '☆'}</button><br />${esc(e.text)}${e.source ? `<br /><span class="muted src-l">出典：${esc(e.source)}</span>` : ''}</span></li>`,
          )}
      </ul>
      <div style="margin-top:12px"><button class="btn" data-close>閉じる</button></div></div>`;
  };
  const { el, close } = sheet(render(i), { label: '人生の記録', dismiss: true });
  const bind = (k: number) => {
    const box = el.querySelector('.sheet')!;
    box.innerHTML = '<button class="sheet-x" data-x aria-label="閉じる">×</button>' + render(k);
    box.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => bind(Number(b.dataset.tab))));
    box.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) =>
      b.addEventListener('click', () => {
        const e = st.persons[k].log[Number(b.dataset.star)];
        e.star = !e.star;
        b.textContent = e.star ? '★' : '☆';
        b.setAttribute('aria-pressed', String(e.star));
      }),
    );
    box.querySelector('[data-close]')!.addEventListener('click', close);
  };
  bind(i);
}

function showHelp(): void {
  const { el, close } = sheet(
    html`<p class="kicker">相談窓口</p>
      <h2>つらい気持ちになったら</h2>
      <p class="prompt">このゲームには、戦争・災害・病気・自殺など、重い出来事が出てきます。読んでいて苦しくなったら、ひとりで抱えずに話してください。</p>
      <p class="muted" style="font-size:13px;margin-top:-6px">厚生労働省「まもろうよ こころ」に掲載の窓口（2026年10月14日に確認）。受付時間は変わることがあります。</p>
      <ul class="helplist">${HELP_LINES.map((h) => `<li><b>${esc(h.name)}</b>${h.tel ? `<a class="tel" href="tel:${h.tel.replace(/-/g, '')}">${esc(h.tel)}</a>` : ''}<span class="hours">${esc(h.hours)}</span>${h.url ? `<br /><a href="${h.url}" target="_blank" rel="noopener">${esc(h.url)}</a>` : ''}</li>`)}</ul>
      <button class="btn" data-close style="margin-top:12px">閉じる</button>`,
    { label: '相談窓口', dismiss: true },
  );
  el.querySelector('[data-close]')!.addEventListener('click', close);
}

function showSources(): void {
  const { el, close } = sheet(
    html`<p class="kicker">出典</p>
      <h2>使った統計と出典</h2>
      <p class="prompt">数字は日本の公的な統計から作っています。取れない年は前後の年から補い、補ったことを記録しています。1930年より前（明治・大正）の数字は、当時の生命表・人口動態統計・学校の統計・長期経済統計などから作った概算で、一部は推計です。1890年より前（江戸・明治の初め）は、歴史人口学の研究などから作った推計です。詳しくはリポジトリの docs/出典一覧.md を見てください。</p>
      <ul class="src">${SOURCES.map((s) => `<li><b>${esc(s.what)}</b>：${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`)}</ul>
      <button class="btn" data-close>閉じる</button>`,
    { label: '出典', dismiss: true },
  );
  el.querySelector('[data-close]')!.addEventListener('click', close);
}

function showAbout(): void {
  const { el, close } = sheet(
    html`<p class="kicker">このゲームについて</p>
      <h2>人生を分けたのは、生まれた年だった</h2>
      <p>同じ一人の人間を、江戸から平成までの3つの時代に同時に生まれさせ、日本の統計で一生をシミュレーションします。いちばん若い人の生まれ年は1990〜2010年から、その年の出生数に比例して選ばれます。ほかの2人は1800年以降のどこかに、どこも30年以上離して置きます。江戸の人の学校や仕事は、寺子屋・藩校・奉公・家督など、その時代の仕組みに読み替えます。</p>
      <p>選んだことは「本人が望んだこと」です。叶うかどうかは、その時代の進学率や求人倍率、家の暮らし向きで決まります。2026年より先の出来事は、国の将来推計にもとづく見通しです。</p>
      <p class="muted" style="font-size:13px">参考にしたゲーム「80億分の1」の考え方に学びましたが、コード・文章・画像は使っていません。</p>
      <button class="btn" data-close>閉じる</button>`,
    { label: 'このゲームについて', dismiss: true },
  );
  el.querySelector('[data-close]')!.addEventListener('click', close);
}


// ---------- 暮らし（家族とお金、思いを残す） ----------

function showKurashi(): void {
  const st = state!;
  const wasPaused = paused;
  paused = true;
  const render = (k: number) => {
    const p = st.persons[k];
    const age = p.alive ? shownAge : p.deathAge ?? shownAge;
    const year = p.birthYear + age;
    const fa = p.fatherAlive ? `${year - p.fatherBirthYear}歳` : '亡くなった';
    const mo = p.motherAlive ? `${year - p.motherBirthYear}歳` : '亡くなった';
    const kids = p.children.length ? p.children.map((c) => (c.alive ? `${c.sex === 'male' ? '男' : '女'}・${Math.max(0, year - c.birthYear)}歳` : '幼くして死去')).join('、') : 'いない';
    return html`<div class="logwrap ${ERA_CLASS[k]}">
      <div class="tabs" role="tablist">${st.persons.map((q, j) => `<button class="btn small ${j === k ? '' : 'ghost'}" role="tab" aria-selected="${j === k}" data-tab="${j}">${q.birthYear}年</button>`)}</div>
      <h2>${esc(p.name)}の暮らし</h2>
      <p class="muted" style="margin-top:0">${year}年・${p.alive ? `${age}歳` : `${p.deathAge}歳で死去`}</p>
      <dl class="kv">
        <dt>父</dt><dd>${fa}</dd>
        <dt>母</dt><dd>${mo}</dd>
        <dt>きょうだい</dt><dd>${p.siblings === 1 ? 'ひとりっ子' : `${p.siblings}人の${p.birthOrder}番目`}</dd>
        <dt>配偶者</dt><dd>${p.married ? (p.spouseAlive ? `${p.marriageType ?? ''}結婚（${p.marriageAge}歳で）` : '亡くなった') : 'いない'}</dd>
        <dt>子ども</dt><dd>${kids}</dd>
        <dt>${p.money < 0 ? 'ローン・借金' : '貯え'}</dt><dd>${yen(Math.abs(p.money))}（今の価値で${yen(Math.abs(p.money) * S.toReal2020(year))}）</dd>
        <dt>${p.pensionMonthly ? '年金' : '年収'}</dt><dd>${p.pensionMonthly ? `月${yen(p.pensionMonthly)}` : p.income > 0 ? yen(p.income) : 'なし'}</dd>
        <dt>お金の置き場所</dt><dd>${st.prefs.invest === 'stock' ? '株' : st.prefs.invest === 'spend' ? '使う' : '銀行（定期預金）'}</dd>
      </dl>
    </div>
    <h3 class="sub">3人のお金（全員に当てはまる）</h3>
    <div class="acts3">
      <button class="btn small" data-money="spend" ${st.done.includes(`spend${shownAge}`) ? 'disabled' : ''}>旅行や趣味に使う</button>
      <button class="btn small ghost" data-money="save" aria-pressed="${st.prefs.invest !== 'stock'}">銀行に預ける</button>
      <button class="btn small ghost" data-money="stock" aria-pressed="${st.prefs.invest === 'stock'}">株を買う</button>
    </div>
    <h3 class="sub">思いを残す</h3>
    <div class="note-row">
      <label for="note" class="sr-only">いまの気持ち</label>
      <input id="note" maxlength="60" placeholder="いまの気持ちを一行で（3人の記録に残ります）" />
      <button class="btn small" data-note>残す</button>
    </div>
    <div style="margin-top:14px"><button class="btn" data-close>閉じる</button></div>`;
  };
  const { el, close } = sheet(render(0), { label: '暮らし', dismiss: true });
  const done = () => {
    paused = wasPaused;
    renderAll();
  };
  const bind = (k: number) => {
    const box = el.querySelector('.sheet')!;
    box.innerHTML = '<button class="sheet-x" data-x aria-label="閉じる">×</button>' + render(k);
    box.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => bind(Number(b.dataset.tab))));
    box.querySelector('[data-close]')!.addEventListener('click', () => {
      close();
      done();
    });
    box.querySelector('[data-x]')!.addEventListener('click', done);
    box.querySelectorAll<HTMLButtonElement>('[data-money]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.money!;
        if (m === 'spend') {
          st.done.push(`spend${shownAge}`);
          st.persons.forEach((p) => {
            if (!p.alive || p.money <= 0) return;
            const y = p.birthYear + shownAge;
            const spent = p.money * 0.15;
            p.money -= spent;
            p.stats.happiness = Math.min(100, p.stats.happiness + 6);
            const where = y < 1965 ? '近くの温泉へ一泊の旅行に出かけた' : y < 1990 ? '家族で旅行に出かけた' : y >= 2020 && y <= 2021 ? '遠出はできず、家で過ごす趣味にお金を使った' : '週末に旅行に出かけた';
            p.log.push({ age: shownAge, year: y, kind: 'money', title: 'お金を使った', text: `${where}。約${yen(spent)}を使った。` });
          });
          toast('3人とも、お金を使いました');
        } else {
          st.prefs.invest = m as 'save' | 'stock';
          toast(m === 'stock' ? 'これから貯えは株で持ちます' : 'これから貯えは銀行に預けます');
        }
        bind(k);
      }),
    );
    box.querySelector('[data-note]')!.addEventListener('click', () => {
      const v = (box.querySelector('#note') as HTMLInputElement).value.trim().slice(0, 60);
      if (!v) return;
      st.persons.forEach((p) => {
        if (p.alive) p.log.push({ age: shownAge, year: p.birthYear + shownAge, kind: 'note', title: '思いを残した', text: v, star: true });
      });
      toast('3人の記録に残しました');
      (box.querySelector('#note') as HTMLInputElement).value = '';
    });
  };
  bind(0);
}

// ---------- 前世の記録と図鑑 ----------

const HIST_KEY = 'umaredoshi.history.v1';
const DEX_KEY = 'umaredoshi.dex.v1';

interface HistRec {
  at: string;
  seed: number;
  pref: number;
  sex: 'male' | 'female';
  years: number[];
  deaths: (number | undefined)[];
  names: string[];
  okuri: string;
  prefs?: number[];
}

function saveHistory(st: GameState, okuri: string): void {
  const list = store.get<HistRec[]>(HIST_KEY) ?? [];
  const rec: HistRec = {
    at: new Date().toISOString().slice(0, 10),
    seed: st.seed,
    pref: st.persons[1].pref,
    prefs: st.persons.map((p) => p.pref),
    sex: st.shared.sex,
    years: st.persons.map((p) => p.birthYear),
    deaths: st.persons.map((p) => p.deathAge),
    names: st.persons.map((p) => p.name),
    okuri,
  };
  const rest = list.filter((r) => r.seed !== st.seed);
  store.set(HIST_KEY, [rec, ...rest].slice(0, 10));
  const dex = new Set(store.get<string[]>(DEX_KEY) ?? []);
  dex.add(`${st.persons.map((p) => p.pref).join('_')}-${st.shared.sex}-${st.gacha.years.join('_')}`);
  store.set(DEX_KEY, [...dex]);
}

/** 珍しい組み合わせ。真ん中の生まれ年と県・性別で決まる */
const RARE: { id: string; label: string; test: (prefs: number[], sex: string, ys: number[]) => boolean }[] = [
  { id: 'hinoe', label: '丙午（1966年）に生まれた人がいる', test: (_p, _s, ys) => ys.includes(1966) },
  { id: 'shusen', label: '終戦の年（1945年）に生まれた人がいる', test: (_p, _s, ys) => ys.includes(1945) },
  { id: 'okinawa', label: '本土復帰の前の沖縄に生まれた人がいる', test: (ps, _s, ys) => ys.some((y, i) => ps[i] === 47 && y >= 1945 && y <= 1971) },
  { id: 'tokyo64', label: '東京オリンピックの年（1964年）に生まれた人がいる', test: (_p, _s, ys) => ys.includes(1964) },
  { id: 'genbaku', label: '広島か長崎で、戦時中に生まれた人がいる', test: (ps, _s, ys) => ys.some((y, i) => (ps[i] === 34 || ps[i] === 42) && y >= 1941 && y <= 1945) },
  { id: 'babyboom2', label: '第2次ベビーブーム（1971〜74年）に生まれた人がいる', test: (_p, _s, ys) => ys.some((y) => y >= 1971 && y <= 1974) },
  { id: 'meiji', label: '明治に生まれた人がいる', test: (_p, _s, ys) => ys.some((y) => y >= 1868 && y < 1912) },
  { id: 'edo', label: '江戸時代に生まれた人がいる', test: (_p, _s, ys) => ys[0] < 1868 },
  { id: 'edo2', label: '2人が江戸時代に生まれた', test: (_p, _s, ys) => ys[1] < 1868 },
  { id: 'kurofune', label: '黒船が来た年（1853年）に生まれた人がいる', test: (_p, _s, ys) => ys.includes(1853) },
  { id: 'ishin', label: '明治元年（1868年）に生まれた人がいる', test: (_p, _s, ys) => ys.includes(1868) },
  { id: 'ryukyu', label: '琉球王国の時代の沖縄に生まれた人がいる', test: (ps, _s, ys) => ys.some((y, i) => ps[i] === 47 && y < 1879) },
  { id: 'gap100', label: '3人の生まれ年が、70年以上離れた', test: (_p, _s, ys) => ys[2] - ys[0] >= 70 },
  { id: 'gap180', label: '3人の生まれ年が、180年以上離れた', test: (_p, _s, ys) => ys[2] - ys[0] >= 180 },
  { id: 'close', label: '3人の生まれ年が、どこもちょうど30年ずつ', test: (_p, _s, ys) => ys[1] - ys[0] === 30 && ys[2] - ys[1] === 30 },
];

function showDex(): void {
  const list = store.get<HistRec[]>(HIST_KEY) ?? [];
  const dex = new Set(store.get<string[]>(DEX_KEY) ?? []);
  const total = 47 * 2 * 16;
  const prefsHit = new Set([...dex].flatMap((k) => k.split('-')[0].split('_').map(Number)));
  const rareHit = RARE.filter((r) => [...dex].some((k) => {
    const [p, s, m] = k.split('-');
    // 古い記録は真ん中の年だけ（30年おき）・県は1つ。新しい記録は3人の年と県を _ でつなぐ
    const ys = m.includes('_') ? m.split('_').map(Number) : [Number(m) - 30, Number(m), Number(m) + 30];
    const ps = p.includes('_') ? p.split('_').map(Number) : [Number(p), Number(p), Number(p)];
    return r.test(ps, s, ys);
  }));
  const { el, close } = sheet(
    html`<p class="kicker">前世の記録と図鑑</p>
      <h2>これまでの人生</h2>
      ${list.length
        ? `<ol class="hist">${list
            .map(
              (r) =>
                `<li><span class="muted">${r.at}・${esc(S.PREFS[r.pref - 1])}・${r.sex === 'male' ? '男' : '女'}</span><b>${r.years.map((y, i) => `${y}年生まれ 享年${r.deaths[i] ?? '−'}`).join('　')}</b>${r.okuri ? `<q>${esc(r.okuri)}</q>` : ''}</li>`,
            )
            .join('')}</ol>`
        : '<p class="muted">まだ記録はありません。最後まで生きると、ここに残ります（直近10回まで）。</p>'}
      <h3 class="sub">図鑑　${dex.size} / ${total}</h3>
      <p class="muted" style="font-size:13px;margin-top:0">3人が生まれた県が塗られていきます。</p>
      <div class="dexmap" aria-label="生まれた都道府県">${S.PREFS.map((n, i) => `<span class="${prefsHit.has(i + 1) ? 'on' : ''}" title="${n}">${n === '北海道' ? n : n.replace(/[都府県]$/, '')}</span>`).join('')}</div>
      <h3 class="sub">珍しい組み合わせ</h3>
      <ul class="rare">${RARE.map((r) => `<li class="${rareHit.includes(r) ? 'on' : ''}">${rareHit.includes(r) ? '◆' : '◇'} ${esc(r.label)}</li>`).join('')}</ul>
      <button class="btn" data-close style="margin-top:12px">閉じる</button>`,
    { label: '前世の記録と図鑑', dismiss: true },
  );
  el.querySelector('[data-close]')!.addEventListener('click', close);
}

// ---------- 最後の画面 ----------

async function showEnd(skipSlides = false): Promise<void> {
  const st = state!;
  stopTimer();
  if (!skipSlides) await showSlides(st);
  window.scrollTo(0, 0);
  const maxLife = Math.max(...st.persons.map((p) => p.lifetimeEarningsReal), 1);
  const maxPen = Math.max(...st.persons.map((p) => p.pensionMonthlyReal ?? 0), 1);
  app.innerHTML = html`${topbar()}
    <main class="wrap end" id="main" style="padding-bottom:60px">
      <p class="kicker">3つの死亡記録</p>
      <h2 class="big">同じ人が、<br />${st.persons.map((p, i) => `<span class="nw">享年${p.deathAge}${i < 2 ? '、' : '。'}</span>`).join('')}</h2>
      <div class="records">${st.persons.map((p, i) => record(p, i))}</div>
      ${recordTable(st)}

      <section class="panel">
        <h3>生涯年収（今の価値）</h3>
        <div class="compare-bars">
          ${st.persons.map((p, i) => `<div class="r"><span class="yr">${p.birthYear}年</span><span class="vals">${yen(p.lifetimeEarningsReal)}</span><div class="track"><i class="${ERA_CLASS[i]}" style="width:${(p.lifetimeEarningsReal / maxLife) * 100}%;background:var(--c-acc)"></i></div></div>`)}
        </div>
        <p class="muted" style="font-size:12px;margin-bottom:0">毎年の年収を消費者物価指数で2020年の価値に直して足したもの。2026年より先は推計。</p>
      </section>

      <section class="panel">
        <h3>年金を何歳から、月いくら</h3>
        <div class="compare-bars">
          ${st.persons.map((p, i) => {
            const v = p.pensionMonthlyReal ?? 0;
            const rng = p.pensionRange ? `（${Math.round(p.pensionRange[0] / 1e4)}〜${Math.round(p.pensionRange[1] / 1e4)}万）` : '';
            const label = p.pensionStartAge !== undefined ? `${p.pensionStartAge}歳から 月${yen(v)}${rng}` : '受け取る前に亡くなった';
            return `<div class="r"><span class="yr">${p.birthYear}年</span><span class="vals">${label}</span><div class="track"><i class="${ERA_CLASS[i]}" style="width:${(v / maxPen) * 100}%;background:var(--c-acc)"></i></div></div>`;
          })}
        </div>
        <p class="muted" style="font-size:12px;margin-bottom:0">今の価値（2020年基準）。2025年より先に受け取り始める人は、2024年財政検証の2つのケースの幅で示します。</p>
      </section>

      <section class="panel">
        <h3>生存曲線</h3>
        ${survivalSvg(st)}
        <p class="muted" style="font-size:12px;margin-bottom:0">同じ年に同じ性別で生まれた人のうち、その年齢で生きている人の割合（生命表から計算）。点はこの3人が亡くなった年齢。</p>
      </section>

      <section class="panel">
        <h3>人生地図</h3>
        <div class="lifemap">${st.persons.map((p, i) => lifeMapRow(p, i))}</div>
        <p class="muted" style="font-size:12px;margin-bottom:0">1マスが1年。色が濃いほど幸福だった年。</p>
      </section>

      ${thoughtsPanel(st)}
      ${wishesPanel(st)}

      <section class="panel">
        <h3>贈ることば</h3>
        <label for="okuri" class="muted" style="display:block;margin-bottom:6px;font-size:13px">次に、どこかの時代に生まれる誰かへ。共有する文章と、前世の記録に残ります。</label>
        <textarea id="okuri" maxlength="140" rows="3" class="okuri" placeholder="例：生まれた年は選べない。でも、望むことはやめなかった。"></textarea>
      </section>

      <section class="panel share">
        <h3>共有カード</h3>
        <canvas id="card" width="1200" height="630" role="img" aria-label="3人の人生をまとめた共有用の画像"></canvas>
        <div class="acts">
          <button class="btn small xbtn" id="xshare"><span aria-hidden="true">𝕏</span> 画像付きでXに投稿</button>
          <button class="btn small ghost" id="save">画像を保存</button>
          <button class="btn small ghost" id="shareb">ほかのアプリで共有</button>
          <button class="btn small ghost" id="copy">文章をコピー</button>
        </div>
      </section>
      <div class="end-acts">
        <button class="btn" id="again">もう一度生まれる</button>
        <button class="btn ghost" data-act="sources2">使った統計と出典</button>
      </div>
    </main>`;
  bindCommon(app);
  store.del(SAVE_KEY);
  saveHistory(st, '');
  const okuri = app.querySelector('#okuri') as HTMLTextAreaElement;
  okuri.addEventListener('change', () => saveHistory(st, okuri.value.slice(0, 140)));
  const canvas = app.querySelector('#card') as HTMLCanvasElement;
  await drawShareCard(canvas, st, isMobile());
  app.querySelector('#save')!.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `umaredoshi-${st.gacha.years.join('-')}.png`;
    a.click();
  });
  // X で共有：共有カードの画像を付けて投稿する。
  // スマホは共有画面（画像と文章）から X を選ぶ。パソコンは X の投稿画面に画像を渡せないので、画像をコピーしてから投稿画面を開き、貼り付けてもらう
  let cardBlob: Blob | null = null;
  canvas.toBlob((b) => (cardBlob = b), 'image/png');
  app.querySelector('#xshare')!.addEventListener('click', async () => {
    const text = endXText(st, (app.querySelector('#okuri') as HTMLTextAreaElement)?.value);
    const file = cardBlob ? new File([cardBlob], 'umaredoshi.png', { type: 'image/png' }) : null;
    if (file && isMobile() && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: xShareText(text) });
      } catch {
        /* キャンセル */
      }
      return;
    }
    openX(text);
    if (!cardBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })]);
      toast('共有カードの画像をコピーしました。開いたXの投稿画面で貼り付けると（Ctrl+V／⌘+V）、画像付きで投稿できます');
    } catch {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'umaredoshi.png';
      a.click();
      toast('共有カードの画像を保存しました。Xの投稿画面で、画像を添付してください');
    }
  });
  app.querySelector('#copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareText(st, (app.querySelector('#okuri') as HTMLTextAreaElement)?.value));
      toast('文章をコピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  });
  app.querySelector('#shareb')!.addEventListener('click', async () => {
    const text = shareText(st, (app.querySelector('#okuri') as HTMLTextAreaElement)?.value);
    try {
      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const file = blob ? new File([blob], 'umaredoshi.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] });
      else if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('共有の代わりに、文章をコピーしました');
      }
    } catch {
      /* キャンセル */
    }
  });
  app.querySelector('#again')!.addEventListener('click', () => {
    state = createGame({ playerBirthYear: ui.playerBirthYear });
    store.set(SAVE_KEY, state);
    showGacha();
  });
  app.querySelector('[data-act="sources2"]')!.addEventListener('click', showSources);
}

function record(p: Person, i: number): string {
  const kids = p.children.length;
  const best = p.bestYear;
  return html`<article class="record ${ERA_CLASS[i]}">
    <div class="muted" style="color:var(--c-sub);font-size:12px">${p.birthYear}–${p.deathYear}</div>
    <div class="kyonen">享年${p.deathAge}</div>
    <div style="font-weight:700;margin-top:4px">${esc(p.name)}</div>
    <dl>
      <dt>死因</dt><dd>${esc(p.deathCause ?? '')}</dd>
      <dt>学歴</dt><dd>${eduLabelOf(p)}</dd>
      <dt>仕事</dt><dd>${esc(p.jobTitle || 'なし')}</dd>
      <dt>家族</dt><dd>${p.married ? `${p.marriageType ?? ''}結婚` : '独身'}${kids ? `・子${kids}人` : ''}</dd>
      <dt>最良の年</dt><dd>${best.age}歳（${best.year}年）</dd>
      <dt>遺産</dt><dd>${yen(Math.max(0, p.money) * S.toReal2020(p.deathYear ?? 2020))}</dd>
      <dt>長生き</dt><dd>${survivalPercentile(p)}%より長く</dd>
    </dl>
  </article>`;
}

/** スマホ用：行見出しつきの比較表（ラベルを列ごとにくり返さない） */
function recordTable(st: GameState): string {
  const ps = st.persons;
  const rows: [string, (p: Person) => string][] = [
    ['死因', (p) => esc(p.deathCause ?? '')],
    ['学歴', (p) => eduLabelOf(p)],
    ['仕事', (p) => esc(p.jobTitle || 'なし')],
    ['家族', (p) => `${p.married ? `${p.marriageType ?? ''}結婚` : '独身'}${p.children.length ? `・<wbr><span class="nw">子${p.children.length}人</span>` : ''}`],
    ['最良の年', (p) => `${p.bestYear.age}歳`],
    ['遺産', (p) => yen(Math.max(0, p.money) * S.toReal2020(p.deathYear ?? 2020))],
    ['長生き', (p) => `${survivalPercentile(p)}%より長く`],
  ];
  return html`<div class="rtable" role="table" aria-label="3人の死亡記録の比較">
    <div class="rt-row rt-head" role="row"><span role="columnheader"></span>${ps.map((p, i) => `<span role="columnheader" class="${ERA_CLASS[i]}"><small>${p.birthYear}–${p.deathYear}</small><b>享年${p.deathAge}</b>${esc(p.name.split(' ')[1] ?? '')}</span>`)}</div>
    ${rows.map(([k, f]) => `<div class="rt-row" role="row"><span role="rowheader">${k}</span>${ps.map((p, i) => `<span role="cell" class="${ERA_CLASS[i]}">${f(p)}</span>`).join('')}</div>`)}
  </div>
  <p class="muted rt-note">遺産は今の価値（2020年基準）。「長生き」は、同じ年に同じ性別で生まれた人のうち何%より長く生きたか。</p>`;
}

function survivalSvg(st: GameState): string {
  const small = isMobile();
  const W = small ? 340 : 600;
  const H = small ? 230 : 300;
  const pad = 30;
  const x = (a: number) => pad + (a / 105) * (W - pad * 1.5);
  const y = (v: number) => H - pad - v * (H - pad * 1.6);
  const colors = ['var(--e0-acc)', 'var(--e1-acc)', 'var(--e2-acc)'];
  const lines = st.persons.map((p, i) => {
    const c = survivalCurve(p.birthYear, p.sex);
    const d = c.map((v, a) => `${a === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const da = p.deathAge ?? 0;
    return `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="2.5"/><circle cx="${x(da)}" cy="${y(c[Math.min(da, 105)])}" r="5" fill="${colors[i]}"/><text x="${x(da)}" y="${y(c[Math.min(da, 105)]) + (i === 1 ? 20 : -10)}" font-size="13" text-anchor="middle" fill="${colors[i]}" font-weight="700" class="lbl">${da}</text>`;
  });
  const grid = [0, 20, 40, 60, 80, 100].map((a) => `<line x1="${x(a)}" x2="${x(a)}" y1="${pad / 2}" y2="${H - pad}" stroke="currentColor" opacity=".12"/><text x="${x(a)}" y="${H - 10}" font-size="12" text-anchor="middle" fill="currentColor" opacity=".8">${a}${small ? '' : '歳'}</text>`);
  const yg = [0, 0.5, 1].map((v) => `<text x="2" y="${y(v) + 4}" font-size="12" fill="currentColor" opacity=".8">${v * 100}%</text>`);
  const legend = st.persons.map((p, i) => `<span><i style="background:${colors[i]}"></i>${p.birthYear}年生まれ（${p.deathAge}歳で死去）</span>`).join('');
  return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="3つの生まれ年の生存曲線">${grid.join('')}${yg.join('')}${lines.join('')}</svg><div class="legend">${legend}</div>`;
}

function lifeMapRow(p: Person, i: number): string {
  const cells = [];
  const n = Math.max(100, p.happinessByAge.length);
  for (let a = 0; a < n; a++) {
    const h = p.happinessByAge[a];
    const style = h === undefined ? 'background:color-mix(in srgb,var(--ink) 6%,transparent)' : `background:color-mix(in srgb,var(--c-acc) ${Math.round(15 + (h / 100) * 85)}%,transparent)`;
    cells.push(`<i style="${style}" title="${a}歳"></i>`);
  }
  return `<div class="rowm ${ERA_CLASS[i]}" style="background:none"><span>${p.birthYear}年</span><div class="cells">${cells.join('')}</div></div>`;
}

/** 一生のあいだに思ったこと。子ども・若いころ・働き盛り・老後から1つずつ */
function thoughtsPanel(st: GameState): string {
  const stages: [number, number][] = [[0, 12], [13, 24], [25, 44], [45, 64], [65, 130]];
  const rows = st.persons.map((p) => {
    const ts = p.log.filter((e) => e.kind === 'think');
    return stages.map(([a, b]) => ts.filter((e) => e.age >= a && e.age <= b)).map((g) => g[Math.floor(g.length / 2)]).filter(Boolean) as LogEntry[];
  });
  if (rows.every((r) => !r.length)) return '';
  return html`<section class="panel">
    <h3>それぞれが、そのとき思ったこと</h3>
    <div class="wish3 thoughts3">
      ${st.persons.map((p, i) => `<div class="${ERA_CLASS[i]}"><b>${p.birthYear}年生まれ</b>${rows[i].length ? `<ul>${rows[i].map((e) => `<li><span class="ta">${e.age}歳</span><span>${esc(e.text)}</span></li>`).join('')}</ul>` : '<p>思いを言葉にする前に、亡くなった。</p>'}</div>`)}
    </div>
  </section>`;
}

function wishesPanel(st: GameState): string {
  const any = st.persons.some((p) => p.wishes.some((w) => !w.ok));
  if (!any) return '';
  return html`<section class="panel">
    <h3>望んだのに、叶わなかったこと</h3>
    <div class="wish3">
      ${st.persons.map((p, i) => {
        const ws = p.wishes.filter((w) => !w.ok).slice(0, 6);
        return `<div class="${ERA_CLASS[i]}"><b>${p.birthYear}年生まれ</b>${ws.length ? `<ul>${ws.map((w) => `<li><span class="x" aria-hidden="true">否</span><span>${w.age}歳　${esc(w.wish)}<small>→ ${esc(w.result)}</small></span></li>`).join('')}</ul>` : '<p>望んだことは、おおむね叶った。</p>'}</div>`;
      })}
    </div>
  </section>`;
}

async function showSlides(st: GameState): Promise<void> {
  const picks: { p: Person; e: LogEntry }[] = [];
  st.persons.forEach((p) => {
    const starred = p.log.filter((e) => e.star);
    const key = p.log.filter((e) => ['birth', 'work', 'family', 'wish', 'death', 'pension'].includes(e.kind));
    const chosen = [...starred, ...key].filter((e, k, arr) => arr.indexOf(e) === k).slice(0, 6);
    chosen.forEach((e) => picks.push({ p, e }));
  });
  // 年齢順に、3人を交互に
  picks.sort((a, b) => a.e.age - b.e.age || a.p.era - b.p.era);
  const box = document.createElement('div');
  box.className = 'slides';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', '走馬灯');
  document.body.appendChild(box);
  let skip = false;
  const btn = document.createElement('button');
  btn.className = 'btn ghost small skip';
  btn.textContent = 'とばす';
  btn.addEventListener('click', () => (skip = true));
  box.appendChild(btn);
  btn.focus();
  for (const { p, e } of picks.slice(0, 24)) {
    if (skip) break;
    const s = document.createElement('div');
    s.className = `s ${ERA_CLASS[p.era]}`;
    s.style.background = 'transparent';
    s.style.color = '#f3eadb';
    s.innerHTML = `<div class="y">${e.year}</div><p>${e.age}歳。${esc(e.text)}</p><p style="opacity:.6;font-size:14px">${p.birthYear}年生まれ</p>`;
    box.querySelector('.s')?.remove();
    box.insertBefore(s, btn);
    await sleep(reducedMotion() ? 900 : 2100);
  }
  box.remove();
}

function toast(msg: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), msg.length > 30 ? 4800 : 2200);
}

// URL で画面確認用の状態に飛べるようにする（?demo=life など。Playwright のスクリーンショット用）
async function boot(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo');
  if (demo) {
    await loadEvents();
    const seed = Number(q.get('seed') ?? 12345);
    state = createGame({ seed, playerBirthYear: 1990 });
    const { playToEnd } = await import('./sim/lab');
    if (demo === 'gacha') return void showGacha();
    if (demo === 'birth') return void showBirth();
    if (demo === 'life' || demo === 'decision' || demo === 'result') {
      // 指定の年齢まで自動で進める
      const target = Number(q.get('age') ?? 18);
      while (state.age < target) {
        let d = dueDecision(state);
        while (d) {
          applyDecision(state, d.id, autoChoose(state, d));
          d = dueDecision(state);
        }
        runYear(state);
      }
      paused = demo === 'life';
      showLife();
      return;
    }
    if (demo === 'end') {
      playToEnd(state);
      return void showEnd(true);
    }
  }
  showTitle();
}

boot();
