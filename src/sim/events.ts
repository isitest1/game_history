// data/events/*.json を読み込む。形が正しくないものは捨てる（読み込みで止まらないように）。

import type { GameEvent } from './types';

const files = import.meta.glob('../../data/events/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

let cache: GameEvent[] | null = null;

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

export function allEvents(): GameEvent[] {
  if (cache) return cache;
  const seen = new Set<string>();
  const out: GameEvent[] = [];
  for (const data of Object.values(files)) {
    if (!Array.isArray(data)) continue;
    for (const e of data) {
      if (!isValidEvent(e) || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  cache = out;
  return out;
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
