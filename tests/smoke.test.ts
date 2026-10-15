import { describe, it, expect, beforeAll } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';

describe('生まれ年の組み合わせ', () => {
  it('1000回引いても範囲を守り、30年おき以外の組み合わせも出る', () => {
    const gaps = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) {
      const [a, b, c] = createGame({ seed }).persons.map((p) => p.birthYear);
      expect(a).toBeGreaterThanOrEqual(1930);
      expect(c).toBeLessThanOrEqual(2010);
      expect(b - a).toBeGreaterThanOrEqual(30);
      expect(c - b).toBeGreaterThanOrEqual(30);
      gaps.add(`${b - a}-${c - b}`);
    }
    expect(gaps.size).toBeGreaterThan(50);
  });
});

describe('通しで1回遊べる', () => {
  it('3人が生まれ、全員が亡くなるまで進む', () => {
    const st = playToEnd(createGame({ seed: 42 }));
    expect(st.persons).toHaveLength(3);
    const [a, b, c] = st.persons.map((p) => p.birthYear);
    // いちばん若い人は1990〜2010年。そこから30〜50年ずつ遡る。いちばん年上でも1930年以降
    expect(c).toBeGreaterThanOrEqual(1990);
    expect(c).toBeLessThanOrEqual(2010);
    expect(c - b).toBeGreaterThanOrEqual(30);
    expect(c - b).toBeLessThanOrEqual(50);
    expect(b - a).toBeGreaterThanOrEqual(30);
    expect(b - a).toBeLessThanOrEqual(50);
    expect(a).toBeGreaterThanOrEqual(1930);
    expect(st.finished).toBe(true);
    for (const p of st.persons) {
      expect(p.alive).toBe(false);
      expect(p.log.length).toBeGreaterThan(3);
    }
  });
});
