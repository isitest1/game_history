// 実験室：たくさんの人生を一気に走らせ、元の統計と比べる。

import { createGame, runYear, cohortLifeExpectancy, type GameState } from './engine';
import { DECISIONS, applyDecision, autoChoose, dueDecision } from './decisions';
import * as S from './stats';

export function playToEnd(state: GameState, maxAge = 115): GameState {
  while (!state.finished && state.age <= maxAge) {
    let d = dueDecision(state);
    while (d) {
      applyDecision(state, d.id, autoChoose(state, d));
      d = dueDecision(state);
    }
    runYear(state);
  }
  return state;
}

export interface LabResult {
  n: number;
  /** 生まれ年でまとめた結果：0 は1800〜1889年、1 は1890〜1929年、2 は1930〜59年、3 は1960年以降 */
  byEra: {
    birthYears: [number, number];
    meanDeathAge: number;
    expected: number;
    highSchool: number;
    university: number;
    married: number;
    meanLifetimeReal: number;
    meanPensionReal: number;
    infantDeath: number;
  }[];
}

export function runLab(n: number, seed0 = 1): LabResult {
  const acc = [0, 1, 2, 3].map(() => ({ death: 0, exp: 0, hs: 0, univ: 0, married: 0, life: 0, pension: 0, pensionN: 0, infant: 0, n: 0, minY: 9999, maxY: 0 }));
  for (let i = 0; i < n; i++) {
    const st = playToEnd(createGame({ seed: seed0 + i * 7919 }));
    st.persons.forEach((p) => {
      // 生まれ年でまとめる（3人の生まれ年は毎回変わるので、何番目の人かではなく、何年生まれかで比べる）
      const a = acc[p.birthYear < 1890 ? 0 : p.birthYear < 1930 ? 1 : p.birthYear < 1960 ? 2 : 3];
      a.n++;
      a.minY = Math.min(a.minY, p.birthYear);
      a.maxY = Math.max(a.maxY, p.birthYear);
      a.death += (p.deathAge ?? 0) + 0.5; // 亡くなった年の途中で亡くなるとみなす
      a.exp += cohortLifeExpectancy(p.birthYear, p.sex);
      if (['high', 'junior', 'univ'].includes(p.edu)) a.hs++;
      if (p.edu === 'univ') a.univ++;
      if (p.married || p.marriageAge !== undefined) a.married++;
      a.life += p.lifetimeEarningsReal;
      if (p.pensionMonthlyReal) {
        a.pension += p.pensionMonthlyReal;
        a.pensionN++;
      }
      if (p.deathAge === 0) a.infant++;
    });
  }
  return {
    n,
    byEra: acc.map((a) => ({
      birthYears: [a.minY, a.maxY],
      meanDeathAge: a.death / a.n,
      expected: a.exp / a.n,
      highSchool: a.hs / a.n,
      university: a.univ / a.n,
      married: a.married / a.n,
      meanLifetimeReal: a.life / a.n,
      meanPensionReal: a.pension / Math.max(1, a.pensionN),
      infantDeath: a.infant / a.n,
    })),
  };
}

export { DECISIONS, S };
