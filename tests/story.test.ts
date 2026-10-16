// 称号・ひとことの一生・共有のリンク（src/sim/story.ts）
import { describe, it, expect } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';
import { titleOf, bioOf, summarize, encodeSummary, decodeSummary } from '../src/sim/story';
import { endXText, xShareText } from '../src/ui/share';

describe('称号と共有', () => {
  it('どの人にも称号と1行の一生が付き、共有のリンクから元に戻せる', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const st = playToEnd(createGame({ seed }));
      for (const p of st.persons) {
        expect(titleOf(p, st.shared.talent).length).toBeGreaterThan(2);
        expect(bioOf(p)).toMatch(/歳、/);
      }
      const sum = summarize(st.persons, st.shared.sex, st.seed, st.gacha.comboProb, st.shared.talent);
      const back = decodeSummary(encodeSummary(sum));
      expect(back).toEqual(JSON.parse(JSON.stringify(sum)));
      expect(xShareText(endXText(st))).toContain('【生まれ年ガチャ】');
    }
  });

  it('小学校（寺子屋）に通えなかった人は、上の学校に進まない', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const st = playToEnd(createGame({ seed }));
      for (const p of st.persons) if (p.flags.includes('no_school')) expect(p.edu).toBe('none');
    }
  });

  it('壊れた共有のリンクは受け付けない', () => {
    expect(decodeSummary('abc')).toBeNull();
    expect(decodeSummary('')).toBeNull();
  });

  it('私の生まれ年と県で回すと、いちばん若い人がその年と県になる', () => {
    const st = createGame({ seed: 3, mine: { year: 1985, pref: 27 } });
    expect(st.persons[2].birthYear).toBe(1985);
    expect(st.persons[2].pref).toBe(27);
    expect(st.persons[1].birthYear).toBeLessThanOrEqual(1955);
    expect(st.persons[0].birthYear).toBeGreaterThanOrEqual(1800);
    expect(st.shared.mine).toBe(true);
  });
});
