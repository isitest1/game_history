// 江戸に生まれた人の一生に、時代に合わない言葉が出ないかを確かめる（docs/09_江戸の読み替え.md）
import { describe, it, expect } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame, eduLabelOf, jobLabelAt } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';
import { placeName } from '../src/sim/stats';
import { wareki, eraName } from '../src/ui/format';

const MODERN = /電話|テレビ|ランドセル|自動車|スマホ|パソコン|団地|定年退職|厚生年金|大企業|中小企業|高校|大学に|大学へ|就職氷河期|コンビニ|窓ガラス|給料日|部活|授業|教室|映画|写真|新聞|会社|電車|汽車|自転車|ラーメン|ケーキ|スーツ/;

describe('江戸に生まれた人', () => {
  it('学制（1872年）より前の記録に、近代の物や仕組みが出てこない', () => {
    const bad: string[] = [];
    let n = 0;
    for (let seed = 1; n < 40 && seed < 2000; seed++) {
      const st0 = createGame({ seed });
      if (st0.persons[0].birthYear >= 1855) continue;
      n++;
      const st = playToEnd(st0);
      const p = st.persons[0];
      for (const e of p.log) {
        if (e.year >= 1872 || !['daily', 'think', 'decision', 'wish', 'work', 'school', 'family', 'health'].includes(e.kind)) continue;
        // 「まだなかった」「まだ珍しく」のように、なかったことを書いた文は除く
        const m = /まだ(なかった|珍しく)|というものは/.test(e.text) ? null : e.text.match(MODERN);
        if (m) bad.push(`${seed} ${e.year} ${e.kind} 「${m[0]}」 ${e.text.slice(0, 60)}`);
      }
    }
    expect(n).toBe(40);
    expect(bad).toEqual([]);
  });

  it('呼び名を時代に合わせる', () => {
    expect(wareki(1853)).toBe('嘉永6年');
    expect(wareki(1868)).toBe('明治元年');
    expect(wareki(1830)).toBe('天保元年');
    expect(eraName(1850)).toBe('江戸');
    expect(placeName(20, 1850)).toBe('信濃（いまの長野県）');
    expect(placeName(20, 1900)).toBe('長野県');
    expect(jobLabelAt('public', 1850)).toBe('武士');
    expect(jobLabelAt('farm', 1850)).toBe('百姓');
    const st = playToEnd(createGame({ seed: 5 }));
    for (const p of st.persons) expect(eduLabelOf(p)).toBeTruthy();
  });
});
