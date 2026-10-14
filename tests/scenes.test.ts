// 同じ選択から、3つの時代で違う結果が出る場面が20個以上あることを確かめる。
// GEN_DOCS=1 で docs/05_同じ選択と3つの結果.md を書き出す。
import { describe, it, expect } from 'vitest';
import { loadEvents } from '../src/sim/events';
import { createGame, runYear } from '../src/sim/engine';
import { DECISIONS, applyDecision, dueDecision } from '../src/sim/decisions';
import type { DecisionResult } from '../src/sim/types';

await loadEvents();

interface Scene { decision: string; option: string; years: number[]; births: number[]; results: (string | null)[]; oks: (boolean | null)[] }

function collect(seeds: number): Scene[] {
  const best = new Map<string, Scene>();
  for (let s = 0; s < seeds; s++) {
    // 選択肢を順番に変えて、いろいろな選び方を試す
    const st = createGame({ seed: 5000 + s });
    while (!st.finished && st.age < 110) {
      let d = dueDecision(st);
      while (d) {
        const opt = d.options[s % d.options.length];
        const years = st.persons.map((p) => p.birthYear + st.age);
        const r: DecisionResult = applyDecision(st, d.id, opt.id);
        const key = `${d.id}:${opt.id}`;
        const texts = r.results.map((x) => x?.text ?? null);
        const alive = r.results.filter(Boolean).length;
        const distinct = new Set(texts.filter(Boolean)).size;
        const prev = best.get(key);
        const score = alive * 10 + distinct;
        const prevScore = prev ? prev.results.filter(Boolean).length * 10 + new Set(prev.results.filter(Boolean)).size : -1;
        if (score > prevScore) best.set(key, { decision: d.title, option: opt.label, years, births: st.persons.map((p) => p.birthYear), results: texts, oks: r.results.map((x) => (x ? x.ok : null)) });
        d = dueDecision(st);
      }
      runYear(st);
    }
  }
  return [...best.values()];
}

describe('同じ選択、3つの結果', () => {
  const scenes = collect(60);
  const contrasting = scenes.filter((sc) => sc.results.filter(Boolean).length === 3 && new Set(sc.results).size === 3);
  it('3人とも生きていて、3つとも違う結果になる場面が20個以上ある', () => {
    expect(contrasting.length).toBeGreaterThanOrEqual(20);
  });
  it('書き出す', async () => {
    const env = (globalThis as any).process?.env ?? {};
    if (!env.GEN_DOCS) return;
    const fs = await import('node:fs');
    const byDecision = new Map<string, Scene[]>();
    for (const sc of contrasting) {
      if (!byDecision.has(sc.decision)) byDecision.set(sc.decision, []);
      byDecision.get(sc.decision)!.push(sc);
    }
    let md = `# 05 同じ選択と3つの結果\n\n決断は1回で3人全員に当てはまり、結果はそれぞれの時代が決める。下は、シミュレーションを実際に走らせて出た例（自動生成：\`GEN_DOCS=1 npx vitest run tests/scenes.test.ts\`）。\n\n- 3人とも生きていて、3つとも違う結果になった場面：${contrasting.length}個（決断${DECISIONS.length}種類のうち${byDecision.size}種類）\n- ○は「叶った」、×は「望んだが叶わなかった」\n\n`;
    let n = 0;
    for (const [title, list] of byDecision) {
      md += `## ${title}\n\n`;
      for (const sc of list.slice(0, 2)) {
        n++;
        md += `### ${n}. 「${sc.option}」\n\n| 生まれ年（その年） | 結果 |\n|---|---|\n`;
        sc.results.forEach((t, i) => (md += `| ${sc.births[i]}年生まれ（${sc.years[i]}年） | ${sc.oks[i] ? '○' : '×'} ${t} |\n`));
        md += '\n';
      }
    }
    fs.writeFileSync('docs/05_同じ選択と3つの結果.md', md);
  });
});
