import { describe, it, expect } from 'vitest';
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';

describe('通しで1回遊べる', () => {
  it('3人が生まれ、全員が亡くなるまで進む', () => {
    const st = playToEnd(createGame({ seed: 42 }));
    expect(st.persons).toHaveLength(3);
    const [a, b, c] = st.persons.map((p) => p.birthYear);
    expect(b - a).toBe(30);
    expect(c - b).toBe(30);
    expect(b).toBeGreaterThanOrEqual(1960);
    expect(b).toBeLessThanOrEqual(1975);
    expect(st.finished).toBe(true);
    for (const p of st.persons) {
      expect(p.alive).toBe(false);
      expect(p.log.length).toBeGreaterThan(3);
    }
  });
});
