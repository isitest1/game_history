import './styles/main.css';
import { createGame, runYear, survivalPercentile, survivalCurve, cohortLifeExpectancy, JOB_LABEL, EDU_LABEL, type GameState, type Focus, type YearEntry } from './sim/engine';
import { dueDecision, viewOf, applyDecision, autoChoose } from './sim/decisions';
import * as S from './sim/stats';
import type { Person, DecisionView, DecisionResult, LogEntry } from './sim/types';
import { esc, wareki, yen, shortYen, html, sleep, reducedMotion } from './ui/format';
import { drawShareCard, shareText } from './ui/sharecard';
import { HELP_LINES, SOURCES } from './ui/content';
import { sound } from './ui/sound';
import { loadEvents } from './sim/events';
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
  minutes: 10 | 15 | 30;
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
  const years = [1935, 1965, 1995];
  const yearOpts = ['<option value="">答えない</option>']
    .concat(Array.from({ length: 2020 - 1925 + 1 }, (_, i) => 2020 - i).map((y) => `<option value="${y}" ${ui.playerBirthYear === y ? 'selected' : ''}>${y}年（${wareki(y)}）</option>`))
    .join('');
  app.innerHTML = html`${topbar()}
    <main class="wrap hero" id="main">
      <div class="hero-grid"><div>
        <p class="kicker">Born in three eras</p>
        <h1><span class="nw">同じ私が、</span><br /><span class="nw">三つの時代に</span><span class="nw"><em>生まれる</em>。</span></h1>
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
          <button data-act="dex">前世の記録と図鑑</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${[0, 1, 2].map((i) => `<div class="art-card ${ERA_CLASS[i]}" data-art="${i}"></div>`).join('')}</div>
      </div>
    </main>`;
  bindCommon(app);
  // 年号がくるくる回る。右の札には、その年に生まれた人の数字を出す
  const els = app.querySelectorAll<HTMLElement>('[data-roll]');
  const arts = app.querySelectorAll<HTMLElement>('[data-art]');
  const paint = (mid: number) => {
    els.forEach((el, i) => (el.textContent = String(mid + (i - 1) * 30)));
    arts.forEach((el, i) => {
      const y = mid + (i - 1) * 30;
      const q0 = (S.qx(y, 0, 'male') + S.qx(y, 0, 'female')) / 2;
      el.innerHTML = `<span class="art-k">${['活版と紙', 'ブラウン管', 'フラット'][i]}</span><b class="yr-num">${y}</b><span class="art-w">${wareki(y)}生まれ</span>
        <dl><dt>生まれた赤ちゃん</dt><dd>${Math.round(S.nationalBirths(y) / 10000)}万人</dd>
        <dt>1歳まで</dt><dd>${Math.round(1 / Math.max(q0, 0.0003))}人に1人が亡くなる</dd>
        <dt>15歳で高校へ</dt><dd>${Math.round((S.eduRate('highSchool', y + 15, 'male') + S.eduRate('highSchool', y + 15, 'female')) / 2)}%</dd>
        <dt>見込みの寿命</dt><dd>${Math.round((cohortLifeExpectancy(y, 'male') + cohortLifeExpectancy(y, 'female')) / 2)}歳</dd></dl>`;
    });
  };
  paint(1965);
  if (!reducedMotion()) {
    let n = 0;
    const iv = setInterval(() => {
      if (!document.body.contains(els[0])) return clearInterval(iv);
      n++;
      paint(1960 + ((5 + n * 7) % 16));
    }, 2600);
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
  app.querySelector('[data-act="dex"]')?.addEventListener('click', showDex);
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
  await spin([...S.PREFS], S.PREFS[st.shared.pref - 1]);
  prob.textContent = '真ん中の年の都道府県別の出生数で重み付け';
  addRow('生まれる県', S.PREFS[st.shared.pref - 1], `${(g.prefProb * 100).toFixed(1)}%`);
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
  label.textContent = '生まれる年（真ん中）';
  prob.textContent = '';
  const ys = Array.from({ length: 16 }, (_, i) => String(1960 + i));
  await spin(ys, String(g.years[1]), 1500);
  prob.textContent = `${g.years[1]}年に生まれたのは${(g.birthsInYear[1] / 10000).toFixed(0)}万人`;
  addRow('生まれる年', `${g.years[1]}年`, `${(g.middleYearProb * 100).toFixed(1)}%`);
  await sleep(skip ? 150 : 900);
  mark(4);
  label.textContent = '30年ずつ離れた、3つの生まれ年';
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
      <h2 style="font-family:var(--serif);font-size:clamp(24px,5vw,36px);margin:6px 0 4px">${esc(S.PREFS[st.shared.pref - 1])}に、${st.shared.sex === 'male' ? '男の子' : '女の子'}が3人生まれた。</h2>
      <p class="muted" style="margin:0 0 12px">家の暮らし向きは「${fam}」。才能は「${esc(st.shared.talent)}」。3人とも同じ人です。</p>
      <div class="books">
        ${st.persons.map((p, i) => birthBook(p, i))}
      </div>
      <p class="muted" style="font-size:13px;margin:-8px 0 16px">見込み寿命は、その年に生まれた人が生命表どおりに生きた場合の平均。1歳までの死亡は、その年の0歳の死亡率から。</p>
      <div class="birth-acts">
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
const SPEEDS = [0.5, 0.8, 1, 2, 4, 8];
let speed = SPEEDS.includes(Number(ui.speed)) ? Number(ui.speed) : 1;
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
          <button class="iconbtn" data-act="theme" aria-label="${themeLabel()}">${ICON[ui.theme]}</button>
          <button class="iconbtn" data-act="help">相談先</button>
        </div>
      </div>
      <div class="yearprog"><i id="prog"></i></div>
    </div>
    <main class="life" id="main">
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
            <button class="iconbtn" id="spd">×1</button>
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
  // スマホ：少しでも下へ送ったら、3人の欄を小さくして上に貼りつける（行き来でちらつかないよう、戻す位置は浅めにする）
  const onScroll = () => {
    if (!colsEl) return;
    const compact = colsEl.classList.contains('is-compact');
    const y = window.scrollY;
    const on = isMobile() && (compact ? y > 4 : y > 24);
    colsEl.classList.toggle('is-compact', on);
    agebarEl.classList.toggle('is-compact', on);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
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
  const spd = app.querySelector('#spd') as HTMLButtonElement;
  spd.textContent = `×${speed}`;
  spd.setAttribute('aria-label', `速さ ×${speed}（押すと切り替わる）`);
  spd.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    spd.textContent = `×${speed}`;
    spd.setAttribute('aria-label', `速さ ×${speed}（押すと切り替わる）`);
    ui.speed = speed;
    savePrefs();
  });
  app.querySelector('#next')!.addEventListener('click', () => {
    untilDecision = true;
    paused = false;
    pp.setAttribute('aria-pressed', 'false');
    pp.textContent = '❚❚';
  });
  app.querySelector('#kurashi')!.addEventListener('click', () => showKurashi());
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

function renderCol(i: number): void {
  if (!state) return;
  const p = state.persons[i];
  const col = app.querySelector(`#col${i}`) as HTMLElement | null;
  if (!col) return;
  const alive = p.alive || deathPending(p);
  const age = alive ? shownAge : p.deathAge ?? shownAge;
  const year = p.birthYear + age;
  const entries = isMobile() ? [] : p.log.filter(isShown).slice(-6).reverse();
  const s = p.stats;
  col.classList.toggle('dead', !alive);
  if (col.dataset.year !== String(year) || !col.querySelector('.scene')) {
    col.dataset.year = String(year);
    col.innerHTML = `${sceneSvg(year)}<div class="col-body"></div>`;
  }
  const body = col.querySelector('.col-body') as HTMLElement;
  body.innerHTML = html`
    <div class="col-head"><span class="yr-num">${year}</span><span class="wa">${wareki(year)}</span></div>
    <div class="who"><span class="nm">${esc(p.name)}</span><span class="st">${esc(statusLine(p))}</span></div>
    ${!alive
      ? `<div class="tomb"><div class="line">${p.birthYear}–${p.deathYear}</div><div class="kyonen">享年${p.deathAge}</div><div class="line">${esc(p.deathCause ?? '')}</div></div><div class="mini" aria-hidden="true"><b>${esc(p.name.split(' ')[1] ?? p.name)}</b><span>${esc(p.deathCause ?? '')}</span></div>`
      : html`<div class="bars" role="img" aria-label="健康${Math.round(s.health)}、幸福${Math.round(s.happiness)}、知識${Math.round(s.knowledge)}、人間関係${Math.round(s.relation)}">
          <span class="b" title="健康"><em>健康</em><span class="bar"><i style="width:${s.health}%"></i></span></span>
          <span class="b" title="幸福"><em>幸福</em><span class="bar"><i style="width:${s.happiness}%"></i></span></span>
          <span class="b" title="知識"><em>知識</em><span class="bar"><i style="width:${s.knowledge}%"></i></span></span>
          <span class="b" title="人間関係"><em>関係</em><span class="bar"><i style="width:${s.relation}%"></i></span></span>
        </div>
        <div class="money"><span>${p.money < 0 ? 'ローン' : '貯え'}</span><b>${yen(Math.abs(p.money))}</b></div>
        ${p.income > 0 && !p.retired ? `<div class="money inc"><span>年収</span><b>${yen(p.income)}</b></div>` : p.pensionMonthly ? `<div class="money inc"><span>年金</span><b>月${yen(p.pensionMonthly)}</b></div>` : ''}
        <div class="mini" aria-hidden="true"><b>${esc(p.name.split(' ')[1] ?? p.name)}</b><span>${p.money < 0 ? '借金' : '貯え'}${shortYen(Math.abs(p.money))}</span></div>`}
    <ul class="feed">
      ${entries.map((e, k) => feedItem(e, k > 0 && !freshEntries.has(e)))}
    </ul>`;
}

/** スマホ：3列の下に、同い年の出来事を横幅いっぱいで読めるように並べる */
function renderMFeed(): void {
  if (!state) return;
  const box = app.querySelector('#mfeed') as HTMLElement | null;
  if (!box) return;
  if (!isMobile()) {
    if (box.innerHTML) box.innerHTML = '';
    return;
  }
  const st = state;
  const rows: { e: LogEntry; i: number }[] = [];
  st.persons.forEach((p, i) => p.log.filter(isShown).forEach((e) => rows.push({ e, i })));
  const ages = [...new Set(rows.map((r) => r.e.age))].sort((a, b) => b - a).slice(0, 4);
  // 同い年の3人を、横にめくらずに縦に並べて見比べる。本文は2行まで、押すと全文
  box.innerHTML = ages
    .map((age) => {
      const lines = st.persons.map((p, i) => {
        const es = rows.filter((r) => r.i === i && r.e.age === age).map((r) => r.e);
        const year = p.birthYear + age;
        const whoOf = (more = '') => `<span class="mwho"><b>${year}</b><small>${esc(p.name.split(' ')[1] ?? '')}</small>${more}</span>`;
        const who = whoOf();
        if (!es.length) {
          const dead = p.deathAge !== undefined && p.deathAge < age && !deathPending(p);
          if (dead) return '';
          return `<div class="mline ${ERA_CLASS[i]} empty">${who}<div class="mbody"><p class="d">特に記録なし</p></div></div>`;
        }
        const moreKey = `${i}:${age}:more`;
        // 3人を一度に見られるよう、1人につき1件だけ出す。残りは「ほか○件」で開く
        const showAll = openKeys.has(moreKey) || es.length <= 1;
        const visible = showAll ? es : es.slice(0, 1);
        const inner = visible
          .map((e) => {
            const key = `${i}:${age}:${p.log.indexOf(e)}`;
            const cls = [e.kind === 'wish' ? 'wish' : '', e.kind === 'decision' || e.kind === 'wish' ? 'dec' : '', e.kind === 'death' ? 'death' : '', e.heavy ? 'heavy' : '', freshEntries.has(e) ? 'fresh' : '', openKeys.has(key) ? 'open' : ''].join(' ');
            return `<button type="button" class="ment ${cls}" data-key="${key}" aria-expanded="${openKeys.has(key)}"><b class="t">${esc(e.title)}</b><span class="d">${esc(e.text)}</span></button>${e.heavy ? '<button class="help-note" data-act="helpnote">つらいときの相談先</button>' : ''}`;
          })
          .join('');
        const more = showAll ? '' : `<button type="button" class="mmore" data-more="${moreKey}">ほか${es.length - 1}件</button>`;
        return `<div class="mline ${ERA_CLASS[i]}">${whoOf(more)}<div class="mbody">${inner}</div></div>`;
      });
      const gone = st.persons.filter((p) => p.deathAge !== undefined && p.deathAge < age && !deathPending(p)).map((p) => `${esc(p.name.split(' ')[1] ?? '')}は${p.deathAge}歳で死去`);
      return `<section class="mrow"><h3 class="mage">${age}歳${gone.length ? `<small>${gone.join('・')}</small>` : ''}</h3>${lines.join('')}</section>`;
    })
    .join('');
  box.querySelectorAll<HTMLButtonElement>('[data-more]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openKeys.add(b.dataset.more!);
      renderMFeed();
    }),
  );
  box.querySelectorAll<HTMLButtonElement>('.ment[data-key]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const k = b.dataset.key!;
      if (openKeys.has(k)) openKeys.delete(k);
      else openKeys.add(k);
      b.classList.toggle('open', openKeys.has(k));
      b.setAttribute('aria-expanded', String(openKeys.has(k)));
    }),
  );
}

/** スマホで全文を開いている出来事 */
const openKeys = new Set<string>();

function renderAll(): void {
  state?.persons.forEach((_, i) => renderCol(i));
  renderMFeed();
}

function feedItem(e: LogEntry, old: boolean): string {
  const cls = [e.kind === 'wish' ? 'wish' : '', e.kind === 'decision' || e.kind === 'wish' ? 'dec' : '', e.kind === 'death' ? 'death' : '', e.heavy ? 'heavy' : '', old ? 'old' : ''].join(' ');
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
      renderAll();
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
  const fast = untilDecision || autoMode;
  const dur = fast ? 120 : yearMs();
  let idx = 0;
  // その年の出来事は、表示が始まるまで隠しておく
  hiddenEntries = new Set(entries.map((x) => x.entry));
  freshEntries = new Set();
  renderAll();
  let elapsed = 0;
  let last = performance.now();
  while (!me.stop) {
    const now = performance.now();
    if (!paused) elapsed += now - last;
    last = now;
    const t = Math.min(1, elapsed / dur);
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
    await sleep(fast ? 16 : 50);
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
              `<li><span class="a">${e.age}歳<br /><span class="muted" style="font-weight:400">${e.year}</span></span><span><b>${esc(e.title)}</b><button class="star" data-star="${idx}" aria-pressed="${!!e.star}" aria-label="☆を付ける">${e.star ? '★' : '☆'}</button><br />${esc(e.text)}${e.source ? `<br /><span class="muted src-l">出典：${esc(e.source)}</span>` : ''}</span></li>`,
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
}

function saveHistory(st: GameState, okuri: string): void {
  const list = store.get<HistRec[]>(HIST_KEY) ?? [];
  const rec: HistRec = {
    at: new Date().toISOString().slice(0, 10),
    seed: st.seed,
    pref: st.shared.pref,
    sex: st.shared.sex,
    years: st.persons.map((p) => p.birthYear),
    deaths: st.persons.map((p) => p.deathAge),
    names: st.persons.map((p) => p.name),
    okuri,
  };
  const rest = list.filter((r) => r.seed !== st.seed);
  store.set(HIST_KEY, [rec, ...rest].slice(0, 10));
  const dex = new Set(store.get<string[]>(DEX_KEY) ?? []);
  dex.add(`${st.shared.pref}-${st.shared.sex}-${st.gacha.years[1]}`);
  store.set(DEX_KEY, [...dex]);
}

/** 珍しい組み合わせ。真ん中の生まれ年と県・性別で決まる */
const RARE: { id: string; label: string; test: (pref: number, sex: string, mid: number) => boolean }[] = [
  { id: 'hinoe', label: '丙午（1966年）に生まれた', test: (_p, _s, m) => m === 1966 },
  { id: 'shusen', label: '終戦の年（1945年）に生まれた人がいる', test: (_p, _s, m) => m === 1975 },
  { id: 'okinawa', label: '本土復帰の前の沖縄に生まれた', test: (p, _s, m) => p === 47 && m <= 1971 },
  { id: 'tokyo64', label: '東京オリンピックの年（1964年）に生まれた', test: (_p, _s, m) => m === 1964 },
  { id: 'genbaku', label: '広島か長崎で、戦時中に生まれた人がいる', test: (p, _s, m) => (p === 34 || p === 42) && m <= 1975 && m >= 1971 },
  { id: 'babyboom2', label: '第2次ベビーブーム（1971〜74年）の真ん中', test: (_p, _s, m) => m >= 1971 && m <= 1974 },
];

function showDex(): void {
  const list = store.get<HistRec[]>(HIST_KEY) ?? [];
  const dex = new Set(store.get<string[]>(DEX_KEY) ?? []);
  const total = 47 * 2 * 16;
  const prefsHit = new Set([...dex].map((k) => Number(k.split('-')[0])));
  const rareHit = RARE.filter((r) => [...dex].some((k) => {
    const [p, s, m] = k.split('-');
    return r.test(Number(p), s, Number(m));
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
      <p class="muted" style="font-size:13px;margin-top:0">都道府県 × 性別 × 真ん中の生まれ年（1960〜75年）の組み合わせ。生まれた県が塗られていきます。</p>
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

      ${wishesPanel(st)}

      <section class="panel">
        <h3>贈ることば</h3>
        <label for="okuri" class="muted" style="display:block;margin-bottom:6px;font-size:13px">次に、同じ県に生まれる誰かへ。共有する文章と、前世の記録に残ります。</label>
        <textarea id="okuri" maxlength="140" rows="3" class="okuri" placeholder="例：生まれた年は選べない。でも、望むことはやめなかった。"></textarea>
      </section>

      <section class="panel share">
        <h3>共有カード</h3>
        <canvas id="card" width="1200" height="630" role="img" aria-label="3人の人生をまとめた共有用の画像"></canvas>
        <div class="acts">
          <button class="btn small" id="save">画像を保存</button>
          <button class="btn small ghost" id="shareb">共有する</button>
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
      <dt>学歴</dt><dd>${EDU_LABEL[p.edu]}</dd>
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
    ['学歴', (p) => EDU_LABEL[p.edu]],
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
