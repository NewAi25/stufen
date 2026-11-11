// Stable ids for pack records (P1-02). A pack knows its records only by string
// keys such as `de:vocab:haus`. The curriculum tables want uuids. stableId maps
// a key to a UUID version 5 (RFC 9562: SHA-1 over a namespace and a name), so
// the same key gives the same id on every machine and on every install. That
// is what keeps attempts, review cards and mastery rows attached to their
// content when a pack is installed again.
import { createHash } from 'node:crypto';
import type {
  CandoInput,
  ExerciseInput,
  LanguageCode,
  LessonInput,
  UnitInput,
} from '@stufen/contracts';

/**
 * The namespace every Stufen pack key is hashed under. Fixed for good: changing
 * it would change every id in every installed pack.
 */
export const STUFEN_PACK_NAMESPACE = '6f0c1c0e-5b7a-5c41-9d2e-7a1f3b8e4c55';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function namespaceBytes(namespace: string): Buffer {
  if (!UUID.test(namespace)) throw new TypeError(`not a uuid: ${namespace}`);
  return Buffer.from(namespace.replaceAll('-', ''), 'hex');
}

/** UUID version 5 of `name` inside `namespace`. The name is hashed as UTF-8. */
export function uuidV5(name: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(namespaceBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = hash.subarray(0, 16);
  // Version 5 in the high nibble of byte 6, the RFC variant in byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** The id of the pack record with this stable key. Same key, same id, always. */
export function stableId(key: string): string {
  if (key === '') throw new TypeError('stableId needs a key that is not empty');
  return uuidV5(key, STUFEN_PACK_NAMESPACE);
}

// ---------------------------------------------------------------
// Which key a record is hashed under. The pack's own `key` wins. The derived
// form is only used for a record that carries no key at all.
// ---------------------------------------------------------------

function own(key: unknown): string | null {
  return typeof key === 'string' && key !== '' ? key : null;
}

/** `<lang>:cando:<code>`, for example `de:cando:A1.LIS.03`. */
export function candoKey(language: LanguageCode, cando: Pick<CandoInput, 'key' | 'code'>): string {
  return own(cando.key) ?? `${language}:cando:${cando.code}`;
}

/** The pack's unit key (`de:unit:a1-01-hallo`), else `<lang>:unit:<slug>`. */
export function unitKey(language: LanguageCode, unit: Pick<UnitInput, 'key' | 'slug'>): string {
  return own(unit.key) ?? `${language}:unit:${unit.slug}`;
}

/** The pack's lesson key (`de:lesson:a1-01-01`), else `<lang>:lesson:<unit slug>/<lesson slug>`. */
export function lessonKey(
  language: LanguageCode,
  unit: Pick<UnitInput, 'slug'>,
  lesson: Pick<LessonInput, 'key' | 'slug'>,
): string {
  return own(lesson.key) ?? `${language}:lesson:${unit.slug}/${lesson.slug}`;
}

/**
 * `<lesson key>#<exercise key>`, for example
 * `de:lesson:a1-01-01#de:exercise:a1-01-01-04`. An exercise without a key of
 * its own uses its ordinal: `de:lesson:a1-01-01#4`.
 */
export function exerciseKey(
  lessonKeyValue: string,
  exercise: Pick<ExerciseInput, 'key' | 'ordinal'>,
): string {
  return `${lessonKeyValue}#${own(exercise.key) ?? exercise.ordinal}`;
}
