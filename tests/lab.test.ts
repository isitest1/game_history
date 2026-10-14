// 実験室：たくさんの人生を走らせ、元の統計と合うかを確かめる。
import { describe, it, expect, beforeAll } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { runLab } from '../src/sim/lab';
import { cohortLifeExpectancy } from '../src/sim/engine';
import * as S from '../src/sim/stats';

const N = Number((globalThis as any).process?.env?.LAB_N ?? 3000);

describe(`実験室（${N}組＝${N * 3}人の人生）`, () => {
  const r = runLab(N);
  it('結果を表示する', () => {
    console.table(
      r.byEra.map((e) => ({
        生まれ年: `${e.birthYears[0]}-${e.birthYears[1]}`,
        平均死亡年齢: e.meanDeathAge.toFixed(1),
        生命表の期待値: e.expected.toFixed(1),
        高校以上: (e.highSchool * 100).toFixed(1) + '%',
        大卒: (e.university * 100).toFixed(1) + '%',
        結婚: (e.married * 100).toFixed(1) + '%',
        乳児死亡: (e.infantDeath * 1000).toFixed(1) + '‰',
        生涯年収_今の価値: Math.round(e.meanLifetimeReal / 1e4) + '万',
        年金月額_今の価値: Math.round(e.meanPensionReal / 1e3) + '千',
      })),
    );
    console.log('目安を使った統計:', [...S.usedFallback]);
  });
  it('平均の死亡年齢が、生命表から計算した平均寿命と合う（1960年以降の生まれは±2歳）', () => {
    expect(Math.abs(r.byEra[1].meanDeathAge - r.byEra[1].expected)).toBeLessThan(2);
    expect(Math.abs(r.byEra[2].meanDeathAge - r.byEra[2].expected)).toBeLessThan(2);
  });
  it('1930〜45年生まれは、生命表に入っていない戦争の死亡のぶん短い（0〜4歳の範囲）', () => {
    // 1944〜46年の生命表は前後の年からの補間で、戦争の死亡を含まない。ゲームでは空襲・沖縄戦・原爆などの出来事で足している
    const gap = r.byEra[0].expected - r.byEra[0].meanDeathAge;
    expect(gap).toBeGreaterThan(-1);
    expect(gap).toBeLessThan(4);
  });
  it('乳児死亡の割合が、生命表の0歳の死亡率と大きくずれない', () => {
    const e0 = r.byEra[0];
    const mid = Math.round((e0.birthYears[0] + e0.birthYears[1]) / 2);
    const q0 = (S.qx(mid, 0, 'male') + S.qx(mid, 0, 'female')) / 2;
    expect(e0.infantDeath).toBeGreaterThan(q0 * 0.5);
    expect(e0.infantDeath).toBeLessThan(q0 * 1.6);
  });
  it('時代が新しいほど、高校・大学に進む割合が高い', () => {
    const [a, b, c] = r.byEra;
    expect(b.highSchool).toBeGreaterThan(a.highSchool);
    expect(c.university).toBeGreaterThan(a.university);
  });
  it('真ん中の世代の高校進学（高校以上）が、統計の進学率から±12ポイント以内', () => {
    const b = r.byEra[1];
    const y = Math.round((b.birthYears[0] + b.birthYears[1]) / 2) + 15;
    const rate = (S.eduRate('highSchool', y, 'male') + S.eduRate('highSchool', y, 'female')) / 200;
    // 15歳まで生きた人に限らないので、乳幼児の死亡ぶん少し低く出る
    expect(Math.abs(b.highSchool - rate)).toBeLessThan(0.12);
  });
  it('コーホートの平均寿命が時代とともに延びる', () => {
    expect(cohortLifeExpectancy(1995, 'female')).toBeGreaterThan(cohortLifeExpectancy(1935, 'female'));
  });
});
