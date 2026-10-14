// X で共有する文章が、X の文字数の上限（280。日本語は1文字2と数える。URLは23）に収まるか
import { describe, it, expect } from 'vitest';
import { loadEvents } from '../src/sim/events';
await loadEvents();
import { createGame } from '../src/sim/engine';
import { playToEnd } from '../src/sim/lab';
import { xIntentUrl, endXText, birthXText, TITLE_X_TEXT, SITE_URL, HASHTAG } from '../src/ui/share';

const weight = (s: string) => [...s].reduce((w, ch) => w + ((ch.codePointAt(0)! <= 0x10ff) ? 1 : 2), 0);

describe('Xで共有', () => {
  it('どの文章も280に収まり、URLとハッシュタグが付く', () => {
    const texts = [TITLE_X_TEXT];
    for (let seed = 1; seed <= 20; seed++) {
      const st = playToEnd(createGame({ seed }));
      texts.push(birthXText(st), endXText(st), endXText(st, 'あ'.repeat(140)));
    }
    for (const t of texts) {
      const u = new URL(xIntentUrl(t));
      expect(u.origin + u.pathname).toBe('https://x.com/intent/tweet');
      expect(u.searchParams.get('url')).toBe(SITE_URL);
      expect(u.searchParams.get('hashtags')).toBe(HASHTAG);
      const body = u.searchParams.get('text')!;
      expect(weight(body) + 1 + 23 + 1 + weight(`#${HASHTAG}`)).toBeLessThanOrEqual(280);
    }
    console.log(endXText(playToEnd(createGame({ seed: 3 }))));
  });
});
