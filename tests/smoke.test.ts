import { describe, it, expect, beforeAll } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';

describe('生まれ年の組み合わせ', () => {
  it('1000回引いても範囲を守り、どこも30年以上離れ、江戸から昭和までいろいろな年が出る', () => {
    const gaps = new Set<string>();
    let edo = 0;
    let showaOld = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const [a, b, c] = createGame({ seed }).persons.map((p) => p.birthYear);
      expect(a).toBeGreaterThanOrEqual(1800);
      expect(c).toBeGreaterThanOrEqual(1990);
      expect(c).toBeLessThanOrEqual(2010);
      expect(b - a).toBeGreaterThanOrEqual(30);
      expect(c - b).toBeGreaterThanOrEqual(30);
      gaps.add(`${b - a}-${c - b}`);
      if (a < 1868) edo++;
      if (a >= 1926) showaOld++;
    }
    expect(gaps.size).toBeGreaterThan(300);
    // いちばん年上が江戸に生まれるのは3〜5割ほど。昭和に生まれる組み合わせも出る
    expect(edo).toBeGreaterThan(250);
    expect(edo).toBeLessThan(550);
    expect(showaOld).toBeGreaterThan(10);
  });
});

describe('通しで1回遊べる', () => {
  it('3人が生まれ、全員が亡くなるまで進む', () => {
    const st = playToEnd(createGame({ seed: 42 }));
    expect(st.persons).toHaveLength(3);
    const [a, b, c] = st.persons.map((p) => p.birthYear);
    // いちばん若い人は1990〜2010年。ほかの2人は1800年以降で、どこも30年以上離れる
    expect(c).toBeGreaterThanOrEqual(1990);
    expect(c).toBeLessThanOrEqual(2010);
    expect(c - b).toBeGreaterThanOrEqual(30);
    expect(b - a).toBeGreaterThanOrEqual(30);
    expect(a).toBeGreaterThanOrEqual(1800);
    expect(st.finished).toBe(true);
    for (const p of st.persons) {
      expect(p.alive).toBe(false);
      expect(p.log.length).toBeGreaterThan(3);
    }
  });
});
