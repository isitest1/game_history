// data/events/*.json を読み込む。最初の画面を軽くするため、ゲームを始めるときに後から読み込む。
// 形が正しくないものは捨てる（読み込みで止まらないように）。

import type { GameEvent } from './types';

const loaders = import.meta.glob('../../data/events/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;

let cache: GameEvent[] | null = null;
let pending: Promise<GameEvent[]> | null = null;

export function isValidEvent(e: any): e is GameEvent {
  return (
    e &&
    typeof e.id === 'string' &&
    typeof e.year === 'number' &&
    typeof e.ageMin === 'number' &&
    typeof e.ageMax === 'number' &&
    typeof e.title === 'string' &&
    typeof e.text === 'string' &&
    typeof e.probability === 'number'
  );
}

export function loadEvents(): Promise<GameEvent[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = Promise.all(Object.values(loaders).map((f) => f())).then((all) => {
      const seen = new Set<string>();
      const out: GameEvent[] = [];
      for (const data of all) {
        if (!Array.isArray(data)) continue;
        for (const e of data) {
          if (!isValidEvent(e) || seen.has(e.id)) continue;
          seen.add(e.id);
          out.push(e);
        }
      }
      cache = out;
      return out;
    });
  }
  return pending;
}

/** 読み込み済みの出来事（loadEvents の前は空） */
export function allEvents(): GameEvent[] {
  return cache ?? [];
}

export function eventStats(): { total: number; byCategory: Record<string, number>; verified: number } {
  const all = allEvents();
  const byCategory: Record<string, number> = {};
  let verified = 0;
  for (const e of all) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    if (e.source?.verified) verified++;
  }
  return { total: all.length, byCategory, verified };
}
