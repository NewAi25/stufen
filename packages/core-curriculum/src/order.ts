// The orderings this box promises, in one place. The service and both store
// adapters sort with these, so a list comes back in the same order whichever
// adapter holds the rows. Text is compared by code unit, not by a database
// collation, which is why the Postgres adapter sorts here too.
import { CEFR_LEVELS } from '@stufen/contracts';
import type { Cando, CefrLevel, Item, Unit } from '@stufen/contracts';

const LEVEL_RANK: Record<CefrLevel, number> = Object.fromEntries(
  CEFR_LEVELS.map((level, index) => [level, index]),
) as Record<CefrLevel, number>;

export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byLevel(a: { level: CefrLevel }, b: { level: CefrLevel }): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
}

/** Lessons and exercises. Ties on `ordinal` fall back to the id, so the order never changes between calls. */
export function byOrdinal<T extends { ordinal: number; id: string }>(a: T, b: T): number {
  return a.ordinal - b.ordinal || byText(a.id, b.id);
}

/** Units: level, then `ordinal`, then id. */
export function byLevelThenOrdinal(a: Unit, b: Unit): number {
  return byLevel(a, b) || byOrdinal(a, b);
}

/** Can do descriptors: level, then `code`, then id. */
export function byLevelThenCode(a: Cando, b: Cando): number {
  return byLevel(a, b) || byText(a.code, b.code) || byText(a.id, b.id);
}

/** Items: level, then `key`, then id. */
export function byLevelThenKey(a: Item, b: Item): number {
  return byLevel(a, b) || byText(a.key, b.key) || byText(a.id, b.id);
}
