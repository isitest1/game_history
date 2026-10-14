import { it } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';
import { usedFallback } from '../src/sim/stats';
it('show', () => {
  const st = playToEnd(createGame({ seed: Number((globalThis as any).process.env.SEED ?? 7) }));
  for (const p of st.persons) {
    console.log(`=== ${p.name} ${p.birthYear} ${p.sex} 死去${p.deathAge} ${p.deathCause} 学歴${p.edu} 生涯${Math.round(p.lifetimeEarningsReal/1e4)}万 年金${Math.round((p.pensionMonthlyReal??0))}`);
    for (const e of p.log) console.log(`${e.age}歳(${e.year}) [${e.kind}] ${e.title}：${e.text}`);
  }
  console.log('fallback', [...usedFallback]);
});
