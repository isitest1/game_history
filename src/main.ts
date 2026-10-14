import './styles/main.css';
import { createGame, runYear, survivalPercentile, survivalCurve, cohortLifeExpectancy, JOB_LABEL, EDU_LABEL, type GameState, type Focus, type YearEntry } from './sim/engine';
import { dueDecision, viewOf, applyDecision, autoChoose } from './sim/decisions';
import * as S from './sim/stats';
import type { Person, DecisionView, DecisionResult, LogEntry } from './sim/types';
import { esc, wareki, yen, html, sleep, reducedMotion } from './ui/format';
import { drawShareCard, shareText } from './ui/sharecard';
import { HELP_LINES, SOURCES } from './ui/content';
import { sound } from './ui/sound';

const app = document.getElementById('app')!;
const SAVE_KEY = 'umaredoshi.save.v1';
const PREF_KEY = 'umaredoshi.prefs.v1';
const ERA_CLASS = ['era-0', 'era-1', 'era-2'];
const BREATH_AGES = [6, 15, 22, 40, 65];

interface UiPrefs {
  playerBirthYear: number | null;
  minutes: 10 | 15 | 30;
  theme: 'auto' | 'light' | 'dark';
  sound: boolean;
  answers: Record<string, string>;
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

const ui: UiPrefs = { playerBirthYear: null, minutes: 15, theme: 'auto', sound: false, answers: {}, ...(store.get<UiPrefs>(PREF_KEY) ?? {}) };
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
    <a class="logo" href="./" data-act="home" aria-label="生まれ年ガチャ トップへ"><span class="seal" aria-hidden="true">生</span>生まれ年ガチャ</a>
    <div style="display:flex;gap:6px;align-items:center">
      ${extra}
      <button class="iconbtn" data-act="theme" aria-label="表示の明るさを切り替える（いま：${ui.theme === 'auto' ? '自動' : ui.theme === 'dark' ? '暗い' : '明るい'}）">${ui.theme === 'dark' ? '☾' : ui.theme === 'light' ? '☀' : '◐'}</button>
      <button class="iconbtn" data-act="help" aria-label="相談窓口">相談先</button>
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
    b.textContent = ui.theme === 'dark' ? '☾' : ui.theme === 'light' ? '☀' : '◐';
    b.setAttribute('aria-label', `表示の明るさを切り替える（いま：${ui.theme === 'auto' ? '自動' : ui.theme === 'dark' ? '暗い' : '明るい'}）`);
  });
  root.querySelector('[data-act="help"]')?.addEventListener('click', () => showHelp());
}

// ---------- タイトル ----------

function showTitle(): void {
  window.scrollTo(0, 0);
  const saved = store.get<GameState>(SAVE_KEY);
  const years = [1935, 1965, 1995];
  const yearOpts = ['<option value="">答えない</option>']
    .concat(Array.from({ length: 2020 - 1925 + 1 }, (_, i) => 2020 - i).map((y) => `<option value="${y}" ${ui.playerBirthYear === y ? 'selected' : ''}>${y}年（${wareki(y)}）</option>`))
    .join('');
  app.innerHTML = html`${topbar()}
    <main class="wrap hero" id="main">
      <div>
        <p class="kicker">Born in three eras</p>
        <h1>同じ私が、<br />三つの時代に<em>生まれる</em>。</h1>
        <div class="triplet" aria-hidden="true">
          ${years.map((y, i) => `<div class="yr ${ERA_CLASS[i]}"><b class="yr-num" data-roll="${i}">${y}</b><span>${['活版と紙', 'ブラウン管', 'フラット'][i]}</span></div>`)}
        </div>
        <p class="lead">性格も、才能も、生まれた県も、家の暮らし向きも同じ。違うのは、生まれた年だけ。あなたの決断は3人全員に当てはまります。けれど、結果を決めるのはそれぞれの時代です。進学も、就職も、結婚も、寿命も、年金も、日本の実際の統計で決まります。</p>
        ${saved && !saved.finished ? `<div class="resume"><span>途中の人生があります（${saved.age}歳）。</span><button class="btn small" data-act="resume">続きから</button></div>` : ''}
        <form class="form" id="startform">
          <div class="row">
            <div>
              <label for="pby">あなたの生まれ年</label>
              <select id="pby" name="pby">${yearOpts}</select>
            </div>
            <div>
              <span id="lenlbl" style="font-size:14px;font-weight:700;display:block;margin-bottom:6px">遊ぶ長さ</span>
              <div class="seg" role="group" aria-labelledby="lenlbl">
                ${[10, 15, 30].map((m) => `<button type="button" data-min="${m}" aria-pressed="${ui.minutes === m}">${m}分</button>`)}
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
        </div>
      </div>
    </main>`;
  bindCommon(app);
  // 年号がくるくる回る
  if (!reducedMotion()) {
    const els = app.querySelectorAll<HTMLElement>('[data-roll]');
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const mid = 1960 + ((n * 7) % 16);
      els.forEach((el, i) => (el.textContent = String(mid + (i - 1) * 30)));
      if (!document.body.contains(els[0])) clearInterval(iv);
    }, 1400);
  }
  app.querySelectorAll<HTMLButtonElement>('[data-min]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.minutes = Number(b.dataset.min) as 10 | 15 | 30;
      app.querySelectorAll('[data-min]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      savePrefs();
    }),
  );
  app.querySelector('[data-act="resume"]')?.addEventListener('click', () => {
    state = saved;
    if (state) showLife();
  });
  app.querySelector('[data-act="sources"]')?.addEventListener('click', showSources);
  app.querySelector('[data-act="help2"]')?.addEventListener('click', () => showHelp());
  app.querySelector('[data-act="about"]')?.addEventListener('click', showAbout);
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

// ---------- ガチャ ----------

async function showGacha(): Promise<void> {
  if (!state) return;
  const st = state;
  window.scrollTo(0, 0);
  const steps = ['生まれる県', '性別', '家の暮らし向き', '生まれる年'];
  app.innerHTML = html`${topbar()}
    <main class="wrap gacha" id="main" aria-live="polite">
      <div class="gacha-steps">${steps.map((s, i) => `<span class="chip" data-step="${i}">${s}</span>`)}</div>
      <div class="label" id="glabel">生まれる県</div>
      <div class="reel" id="reel">　</div>
      <div class="prob" id="gprob"></div>
      <button class="btn ghost small" id="skip">とばす</button>
    </main>`;
  bindCommon(app);
  let skip = false;
  app.querySelector('#skip')!.addEventListener('click', () => (skip = true));
  const reel = app.querySelector('#reel') as HTMLElement;
  const label = app.querySelector('#glabel') as HTMLElement;
  const prob = app.querySelector('#gprob') as HTMLElement;
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
  const mark = (i: number) => app.querySelectorAll('[data-step]').forEach((c, k) => c.classList.toggle('on', k <= i));
  const g = st.gacha;
  mark(0);
  await spin([...S.PREFS], S.PREFS[st.shared.pref - 1]);
  prob.textContent = `この県に生まれる確率は${(g.prefProb * 100).toFixed(1)}%（真ん中の年の出生数から）`;
  await sleep(skip ? 0 : 1100);
  mark(1);
  label.textContent = '性別';
  prob.textContent = '';
  await spin(['男', '女'], st.shared.sex === 'male' ? '男' : '女', 900);
  prob.textContent = `${(g.sexProb * 100).toFixed(1)}%（出生の男女比）`;
  await sleep(skip ? 0 : 1000);
  mark(2);
  label.textContent = '家の暮らし向き';
  prob.textContent = '';
  const fam = ['苦しい', 'やや苦しい', 'ふつう', 'やや豊か', '豊か'];
  await spin(fam, fam[st.shared.familyClass - 1], 900);
  prob.textContent = '5段階。どれも20%';
  await sleep(skip ? 0 : 1000);
  mark(3);
  label.textContent = '生まれる年（真ん中）';
  prob.textContent = '';
  const ys = Array.from({ length: 16 }, (_, i) => String(1960 + i));
  await spin(ys, String(g.years[1]), 1500);
  prob.textContent = `${g.years[1]}年に生まれたのは${(g.birthsInYear[1] / 10000).toFixed(0)}万人。確率${(g.middleYearProb * 100).toFixed(1)}%`;
  await sleep(skip ? 200 : 1200);
  reel.textContent = `${g.years[0]}・${g.years[1]}・${g.years[2]}`;
  label.textContent = '30年ずつ離れた、3つの生まれ年';
  prob.textContent = '';
  await sleep(skip ? 200 : 1400);
  showBirth();
}

// ---------- 母子手帳 ----------

function showBirth(): void {
  if (!state) return;
  const st = state;
  window.scrollTo(0, 0);
  const fam = ['苦しい', 'やや苦しい', 'ふつう', 'やや豊か', '豊か'][st.shared.familyClass - 1];
  app.innerHTML = html`${topbar()}
    <main class="wrap" id="main" style="padding-bottom:40px">
      <p class="kicker">母子手帳</p>
      <h2 style="font-family:var(--serif);font-size:clamp(24px,5vw,36px);margin:6px 0 4px">${esc(S.PREFS[st.shared.pref - 1])}に、${st.shared.sex === 'male' ? '男の子' : '女の子'}が3人生まれた。</h2>
      <p class="muted" style="margin:0 0 12px">家の暮らし向きは「${fam}」。才能は「${esc(st.shared.talent)}」。3人とも同じ人です。</p>
      <div class="books">
        ${st.persons.map((p, i) => birthBook(p, i))}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="go">人生を始める</button>
        <button class="btn ghost" id="again">引き直す</button>
      </div>
    </main>`;
  bindCommon(app);
  app.querySelector('#go')!.addEventListener('click', () => showLife());
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
      <dt>家</dt><dd>${JOB_LABEL[p.parentJob]}</dd>
      <dt>きょうだい</dt><dd>${p.siblings}人の${p.siblings === 1 ? 'ひとりっ子' : `${p.birthOrder}番目`}</dd>
      <dt>父・母</dt><dd>${p.birthYear - p.fatherBirthYear}歳・${p.birthYear - p.motherBirthYear}歳</dd>
      <dt>この年の出生</dt><dd>${Math.round(S.nationalBirths(p.birthYear) / 10000)}万人</dd>
      <dt>1歳まで</dt><dd>${Math.round(1 / Math.max(q0, 0.0003))}人に1人が亡くなる</dd>
      <dt>見込み寿命</dt><dd>${le.toFixed(0)}歳（この年生まれの平均）</dd>
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

let speed = 1;
let paused = false;
let untilDecision = false;
let autoMode = false;
/** 画面に出している年齢（runYear のあとも、その年を見せているあいだは前の年齢のまま） */
let shownAge = 0;

function yearMs(): number {
  // 平均して約90年。決断とひと息の時間を差し引いて、1年の長さを決める
  const total = ui.minutes * 60 * 1000 * 0.72;
  return Math.max(1500, total / 90) / speed;
}

function showLife(): void {
  if (!state) return;
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
          <button class="iconbtn" data-act="theme" aria-label="表示の明るさを切り替える">${ui.theme === 'dark' ? '☾' : ui.theme === 'light' ? '☀' : '◐'}</button>
          <button class="iconbtn" data-act="help" aria-label="相談窓口">相談先</button>
        </div>
      </div>
      <div class="yearprog"><i id="prog"></i></div>
    </div>
    <main class="life" id="main">
      <div class="cols">
        ${st.persons.map((p, i) => `<section class="col ${ERA_CLASS[i]}" id="col${i}" aria-label="${p.birthYear}年生まれの人生"></section>`)}
      </div>
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
            <button class="iconbtn" id="spd" aria-label="速さを変える">×1</button>
          </div>
          <div class="grp">
            <button class="iconbtn" id="auto" aria-pressed="${autoMode}" aria-label="決断をおまかせにする">おまかせ</button>
            <button class="iconbtn" id="next" aria-label="次の決断まで進める">次の決断まで ▸▸</button>
          </div>
        </div>
      </div>
    </nav>`;
  bindCommon(app);
  st.persons.forEach((_, i) => renderCol(i));
  renderFocus();
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
  const spd = app.querySelector('#spd') as HTMLButtonElement;
  spd.textContent = `×${speed}`;
  spd.addEventListener('click', () => {
    speed = speed >= 8 ? 1 : speed * 2;
    spd.textContent = `×${speed}`;
  });
  app.querySelector('#next')!.addEventListener('click', () => {
    untilDecision = true;
    paused = false;
    pp.setAttribute('aria-pressed', 'false');
    pp.textContent = '❚❚';
  });
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

function renderCol(i: number, fresh: LogEntry[] = []): void {
  if (!state) return;
  const p = state.persons[i];
  const col = app.querySelector(`#col${i}`) as HTMLElement | null;
  if (!col) return;
  const age = p.alive ? shownAge : p.deathAge ?? shownAge;
  const year = p.birthYear + age;
  const entries = p.log.slice(-6).reverse();
  const s = p.stats;
  col.classList.toggle('dead', !p.alive);
  col.innerHTML = html`
    <div class="col-head"><span class="yr-num">${year}</span><span class="wa">${wareki(year)}</span></div>
    <div class="who">${esc(p.name)}<br />${esc(statusLine(p))}</div>
    ${!p.alive
      ? `<div class="tomb"><div class="line">${p.birthYear}–${p.deathYear}</div><div class="kyonen">享年${p.deathAge}</div><div class="line">${esc(p.deathCause ?? '')}</div></div>`
      : html`<div class="bars" aria-label="状態">
          <span>健康</span><span class="bar"><i style="width:${s.health}%"></i></span>
          <span>幸福</span><span class="bar"><i style="width:${s.happiness}%"></i></span>
          <span>知識</span><span class="bar"><i style="width:${s.knowledge}%"></i></span>
          <span>人間関係</span><span class="bar"><i style="width:${s.relation}%"></i></span>
        </div>
        <div class="money"><span>貯え</span><b>${yen(p.money)}</b></div>`}
    <ul class="feed">
      ${entries.map((e, k) => feedItem(e, k > 0 && !fresh.includes(e)))}
    </ul>`;
}

function feedItem(e: LogEntry, old: boolean): string {
  const cls = [e.kind === 'wish' ? 'wish' : '', e.kind === 'death' ? 'death' : '', e.heavy ? 'heavy' : '', old ? 'old' : ''].join(' ');
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
    // ひと息
    if (BREATH_AGES.includes(st.age) && !st.done.includes(`breath${st.age}`) && st.persons.some((p) => p.alive)) {
      st.done.push(`breath${st.age}`);
      if (!autoMode) await showBreather(st.age);
    }
    // 決断
    let d = dueDecision(st);
    while (d && !me.stop) {
      const view = viewOf(st, d);
      let choice: string;
      if (autoMode) choice = autoChoose(st, d);
      else {
        untilDecision = false;
        choice = await askDecision(view);
      }
      const res = applyDecision(st, d.id, choice);
      st.persons.forEach((_, i) => renderCol(i));
      if (!autoMode) await showResult(view, res);
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
  // 列の年だけ先に進める
  const fast = untilDecision || autoMode;
  const dur = fast ? 120 : yearMs();
  const t0 = performance.now();
  let idx = 0;
  // その年の出来事は、表示が始まるまで隠しておく
  const hidden = new Set(entries.map((x) => x.entry));
  const visibleLog = (p: Person) => p.log.filter((e) => !hidden.has(e));
  const render = (i: number, fresh: LogEntry[]) => {
    const p = st.persons[i];
    const saved = p.log;
    const aliveSaved = p.alive;
    const deadNotShown = !p.alive && entries.some((x) => x.personIndex === i && x.entry.kind === 'death' && hidden.has(x.entry));
    p.log = visibleLog(p);
    if (deadNotShown) p.alive = true;
    renderCol(i, fresh);
    p.log = saved;
    p.alive = aliveSaved;
  };
  st.persons.forEach((_, i) => render(i, []));
  let elapsed = 0;
  let last = t0;
  while (!me.stop) {
    const now = performance.now();
    if (!paused) elapsed += now - last;
    last = now;
    const t = Math.min(1, elapsed / dur);
    if (prog) prog.style.width = `${t * 100}%`;
    const fresh: Record<number, LogEntry[]> = {};
    while (idx < entries.length && entries[idx].t <= t) {
      const x = entries[idx];
      hidden.delete(x.entry);
      (fresh[x.personIndex] ??= []).push(x.entry);
      if (x.entry.kind === 'death') sound.bell();
      idx++;
    }
    Object.keys(fresh).forEach((k) => render(Number(k), fresh[Number(k)]));
    if (t >= 1) break;
    await sleep(fast ? 16 : 50);
  }
  st.persons.forEach((_, i) => renderCol(i));
}

// ---------- 重ねる画面 ----------

function sheet(inner: string, opts: { label: string; dismiss?: boolean } = { label: '' }): { el: HTMLElement; close: () => void } {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label)}">${inner}</div>`;
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
  if (opts.dismiss) back.addEventListener('click', (e) => e.target === back && close());
  const first = back.querySelector<HTMLElement>('button, a, textarea, select');
  setTimeout(() => first?.focus(), 30);
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
          ${st.persons.map((p, i) => `<div class="${ERA_CLASS[i]}"><b>${p.birthYear + v.age}年</b>${p.alive ? esc(v.evidence[i]) : '（亡くなっている）'}</div>`)}
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
            if (!x) return `<div class="${ERA_CLASS[i]}"><span class="mark">${p.birthYear + v.age}年</span>${p.alive ? '関係なし' : '（亡くなっている）'}</div>`;
            return `<div class="${ERA_CLASS[i]} ${x.ok ? 'ok' : 'ng'}"><span class="mark">${p.birthYear + v.age}年　${x.ok ? '叶った' : '叶わなかった'}</span>${esc(x.text)}</div>`;
          })}
        </div>
        <button class="btn" id="cont">続ける</button>`,
      { label: '決断の結果' },
    );
    el.querySelector('#cont')!.addEventListener('click', () => {
      close();
      resolve();
    });
  });
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
        <div class="cmp">
          ${st.persons.map((p, i) => `<div class="${ERA_CLASS[i]}"><b>${p.birthYear + age}年</b>${p.alive ? esc(statusLine(p) || `${age}歳`) : `享年${p.deathAge}`}<br /><span style="font-size:11px">高校進学率 ${Math.round(S.eduRate('highSchool', p.birthYear + 15, p.sex))}%</span></div>`)}
          <div class="you"><b>${yourYear ?? '−'}年</b>${yourYear ? (yourYear > 2026 ? 'あなたのこれから' : 'あなた') : '生まれ年が未入力'}<br /><span style="font-size:11px">${py ? `高校進学率 ${Math.round(S.eduRate('highSchool', py + 15, st.shared.sex))}%` : ''}</span></div>
        </div>
        <div class="breather">
          <label for="ans" style="font-weight:700;display:block;margin-bottom:6px">${esc(BREATH_Q[age])}</label>
          <textarea id="ans" placeholder="書かなくても進めます。この端末の中にだけ残ります。">${esc(ui.answers[String(age)] ?? '')}</textarea>
        </div>
        <div style="margin-top:12px"><button class="btn" id="cont">続ける</button></div>`,
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
    return html`<div class="tabs">${st.persons.map((q, j) => `<button class="btn small ${j === k ? '' : 'ghost'}" data-tab="${j}">${q.birthYear}年</button>`)}</div>
      <h2>${esc(p.name)}の記録</h2>
      <p class="muted" style="margin-top:0">☆を押すと、走馬灯に残ります。</p>
      <ul class="logfull">
        ${p.log
          .map((e, idx) => ({ e, idx }))
          .reverse()
          .map(
            ({ e, idx }) =>
              `<li><span class="a">${e.age}歳<br /><span class="muted" style="font-weight:400">${e.year}</span></span><span><b>${esc(e.title)}</b><br />${esc(e.text)}${e.source ? `<br /><span class="muted" style="font-size:12px">出典：${esc(e.source)}</span>` : ''}</span><button class="star" data-star="${idx}" aria-pressed="${!!e.star}" aria-label="☆を付ける">${e.star ? '★' : '☆'}</button></li>`,
          )}
      </ul>
      <div style="margin-top:12px"><button class="btn" data-close>閉じる</button></div>`;
  };
  const { el, close } = sheet(render(i), { label: '人生の記録', dismiss: true });
  const bind = (k: number) => {
    const box = el.querySelector('.sheet')!;
    box.innerHTML = render(k);
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
      <ul class="helplist">${HELP_LINES.map((h) => `<li><b>${esc(h.name)}</b>${h.tel ? `<a href="tel:${h.tel.replace(/-/g, '')}">${esc(h.tel)}</a>　` : ''}${esc(h.hours)}${h.url ? `<br /><a href="${h.url}" target="_blank" rel="noopener">${esc(h.url)}</a>` : ''}</li>`)}</ul>
      <p class="muted" style="font-size:13px">厚生労働省「まもろうよ こころ」に掲載の窓口（2026年10月14日に確認）。受付時間は変わることがあります。</p>
      <button class="btn" data-close>閉じる</button>`,
    { label: '相談窓口', dismiss: true },
  );
  el.querySelector('[data-close]')!.addEventListener('click', close);
}

function showSources(): void {
  const { el, close } = sheet(
    html`<p class="kicker">出典</p>
      <h2>使った統計と出典</h2>
      <p class="prompt">数字は日本の公的な統計から作っています。取れない年は前後の年から補い、補ったことを記録しています。詳しくはリポジトリの docs/出典一覧.md を見てください。</p>
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
      <p>同じ一人の人間を、30年ずつ離れた3つの時代に同時に生まれさせ、日本の統計で一生をシミュレーションします。真ん中の生まれ年は1960〜75年から、その年の出生数に比例して選ばれます。</p>
      <p>選んだことは「本人が望んだこと」です。叶うかどうかは、その時代の進学率や求人倍率、家の暮らし向きで決まります。2026年より先の出来事は、国の将来推計にもとづく見通しです。</p>
      <p class="muted" style="font-size:13px">参考にしたゲーム「80億分の1」の考え方に学びましたが、コード・文章・画像は使っていません。</p>
      <button class="btn" data-close>閉じる</button>`,
    { label: 'このゲームについて', dismiss: true },
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
      <h2 class="big">同じ人が、<br />${st.persons.map((p) => `享年${p.deathAge}`).join('、')}。</h2>
      <div class="records">${st.persons.map((p, i) => record(p, i))}</div>

      <section class="panel">
        <h3>生涯年収（今の価値）</h3>
        <div class="compare-bars">
          ${st.persons.map((p, i) => `<div class="r"><span>${p.birthYear}年</span><div class="track"><i class="${ERA_CLASS[i]}" style="width:${(p.lifetimeEarningsReal / maxLife) * 100}%;background:var(--c-acc)"></i><span>${yen(p.lifetimeEarningsReal)}</span></div></div>`)}
        </div>
        <p class="muted" style="font-size:12px;margin-bottom:0">毎年の年収を消費者物価指数で2020年の価値に直して足したもの。2026年より先は推計。</p>
      </section>

      <section class="panel">
        <h3>年金を何歳から、月いくら</h3>
        <div class="compare-bars">
          ${st.persons.map((p, i) => {
            const v = p.pensionMonthlyReal ?? 0;
            const label = p.pensionStartAge !== undefined ? `${p.pensionStartAge}歳から 月${yen(v)}${p.pensionRange ? `（${yen(p.pensionRange[0])}〜${yen(p.pensionRange[1])}）` : ''}` : '受け取る前に亡くなった';
            return `<div class="r"><span>${p.birthYear}年</span><div class="track"><i class="${ERA_CLASS[i]}" style="width:${(v / maxPen) * 100}%;background:var(--c-acc)"></i><span>${label}</span></div></div>`;
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

      ${wishesPanel(st)}

      <section class="panel share">
        <h3>共有カード</h3>
        <canvas id="card" width="1200" height="630" aria-label="3人の人生をまとめた画像"></canvas>
        <div class="acts">
          <button class="btn small" id="save">画像を保存</button>
          <button class="btn small ghost" id="shareb">共有する</button>
          <button class="btn small ghost" id="copy">文章をコピー</button>
        </div>
      </section>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="again">もう一度生まれる</button>
        <button class="btn ghost" data-act="sources2">出典</button>
      </div>
    </main>`;
  bindCommon(app);
  store.del(SAVE_KEY);
  const canvas = app.querySelector('#card') as HTMLCanvasElement;
  await drawShareCard(canvas, st);
  app.querySelector('#save')!.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `umaredoshi-${st.gacha.years.join('-')}.png`;
    a.click();
  });
  app.querySelector('#copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareText(st));
      toast('文章をコピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  });
  app.querySelector('#shareb')!.addEventListener('click', async () => {
    const text = shareText(st);
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
      <dt>学歴</dt><dd>${EDU_LABEL[p.edu]}</dd>
      <dt>仕事</dt><dd>${esc(p.jobTitle || 'なし')}</dd>
      <dt>家族</dt><dd>${p.married ? `${p.marriageType ?? ''}結婚` : '独身'}${kids ? `・子${kids}人` : ''}</dd>
      <dt>幸せな年</dt><dd>${best.age}歳（${best.year}年）</dd>
      <dt>遺した財産</dt><dd>${yen(Math.max(0, p.money) * S.toReal2020(p.deathYear ?? 2020))}（今の価値）</dd>
      <dt>長生き</dt><dd>同じ年に生まれた人の${survivalPercentile(p)}%より長く生きた</dd>
    </dl>
  </article>`;
}

function survivalSvg(st: GameState): string {
  const W = 600;
  const H = 260;
  const pad = 30;
  const x = (a: number) => pad + (a / 105) * (W - pad * 1.5);
  const y = (v: number) => H - pad - v * (H - pad * 1.6);
  const colors = ['var(--e0-acc)', 'var(--e1-acc)', 'var(--e2-acc)'];
  const lines = st.persons.map((p, i) => {
    const c = survivalCurve(p.birthYear, p.sex);
    const d = c.map((v, a) => `${a === 0 ? 'M' : 'L'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const da = p.deathAge ?? 0;
    return `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="2.5"/><circle cx="${x(da)}" cy="${y(c[Math.min(da, 105)])}" r="5" fill="${colors[i]}"/><text x="${x(da) + 7}" y="${y(c[Math.min(da, 105)]) - 6}" font-size="12" fill="currentColor">${p.birthYear}年生まれ</text>`;
  });
  const grid = [0, 20, 40, 60, 80, 100].map((a) => `<line x1="${x(a)}" x2="${x(a)}" y1="${pad / 2}" y2="${H - pad}" stroke="currentColor" opacity=".12"/><text x="${x(a)}" y="${H - 10}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">${a}歳</text>`);
  const yg = [0, 0.5, 1].map((v) => `<text x="4" y="${y(v) + 4}" font-size="11" fill="currentColor" opacity=".7">${v * 100}%</text>`);
  return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="3つの生まれ年の生存曲線">${grid.join('')}${yg.join('')}${lines.join('')}</svg>`;
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

function wishesPanel(st: GameState): string {
  const rows = st.persons.flatMap((p, i) => p.wishes.filter((w) => !w.ok).map((w) => ({ p, i, w })));
  if (!rows.length) return '';
  return html`<section class="panel">
    <h3>望んだのに、叶わなかったこと</h3>
    <ul style="margin:0;padding-left:1.2em">
      ${rows.slice(0, 18).map(({ p, w }) => `<li>${p.birthYear}年生まれ・${w.age}歳：${esc(w.wish)} → ${esc(w.result)}</li>`)}
    </ul>
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
  setTimeout(() => t.remove(), 2200);
}

// URL で画面確認用の状態に飛べるようにする（?demo=life など。Playwright のスクリーンショット用）
async function boot(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo');
  if (demo) {
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
