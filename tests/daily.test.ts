// 日常と心の声のデータ（data/daily）を確かめる。書き方は docs/07_日常と心の声.md
import { describe, it, expect } from 'vitest';
import { DAILY } from '../src/sim/daily';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';

const WHEN_KEYS = new Set(['sex', 'married', 'widowed', 'hasChildren', 'childAge', 'hasSibling', 'mother', 'father', 'school', 'working', 'job', 'retired', 'urban', 'rich', 'poor', 'mood', 'sick', 'flags', 'notFlags', 'trigger']);
const TRIGGERS = new Set(['married', 'child', 'parent_death', 'spouse_death', 'job', 'retire', 'ill', 'wish_fail', 'moved', 'school']);
const SLOTS = new Set(['name', 'friend', 'spouse', 'child', 'childAge', 'sib', 'pet', 'pref', 'mAge', 'fAge']);
const BANNED = ['効く', '寄り添', 'かけがえのない', '紡ぐ', '彩る'];

describe('日常と心の声のデータ', () => {
  it('形が正しい', () => {
    const bad: string[] = [];
    const ids = new Set<string>();
    for (const d of DAILY) {
      const why: string[] = [];
      if (ids.has(d.id)) why.push('idが重複');
      ids.add(d.id);
      if (d.kind !== 'daily' && d.kind !== 'think') why.push('kind');
      if (!(d.ageMin >= 0 && d.ageMax >= d.ageMin && d.ageMax <= 120)) why.push('年齢の範囲');
      if (d.yearMin !== undefined && d.yearMin > 2026) why.push('2027年以降を時代に結びつけている');
      if (d.yearMin !== undefined && d.yearMax !== undefined && d.yearMax < d.yearMin) why.push('年の範囲');
      for (const k of Object.keys(d.when ?? {})) if (!WHEN_KEYS.has(k)) why.push(`未知の条件 ${k}`);
      if (d.when?.trigger && !TRIGGERS.has(d.when.trigger)) why.push(`未知のきっかけ ${d.when.trigger}`);
      for (const m of d.text.matchAll(/\{(\w+)\}/g)) if (!SLOTS.has(m[1])) why.push(`未知の差し込み ${m[1]}`);
      if (!d.text || d.text.length > 140) why.push('本文の長さ');
      for (const w of BANNED) if (d.text.includes(w)) why.push(`使わない言い回し ${w}`);
      if (why.length) bad.push(`${d.id}: ${why.join('、')}`);
    }
    expect(bad).toEqual([]);
  });

  it('十分な量がある', () => {
    expect(DAILY.filter((d) => d.kind === 'daily').length).toBeGreaterThan(600);
    expect(DAILY.filter((d) => d.kind === 'think').length).toBeGreaterThan(200);
  });

  it('一生のどの年にも、記録がある（30組90人）', () => {
    let years = 0;
    let empty = 0;
    let daily = 0;
    let think = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const st = playToEnd(createGame({ seed }));
      for (const p of st.persons) {
        const ages = new Set(p.log.map((e) => e.age));
        for (let a = 0; a <= (p.deathAge ?? 0); a++) {
          years++;
          if (!ages.has(a)) empty++;
        }
        daily += p.log.filter((e) => e.kind === 'daily').length;
        think += p.log.filter((e) => e.kind === 'think').length;
      }
    }
    console.log({ years, empty, dailyPerYear: (daily / years).toFixed(2), thinkPerYear: (think / years).toFixed(2) });
    expect(empty / years).toBeLessThan(0.01);
  });
});
