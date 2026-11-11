// Pack to snapshot (P1-03). Maps the pack's input shapes (snake_case, string
// keys) to the contracts domain types (camelCase, uuids) that the curriculum
// store holds. Pure: no clock, no random ids, no writes. Building the same pack
// twice gives deep equal snapshots, because every id comes from stableId.
import { CEFR_LEVELS } from '@stufen/contracts';
import type {
  Cando,
  CandoInput,
  CurriculumSnapshot,
  Exercise,
  ExerciseInput,
  Item,
  ItemInput,
  LanguageCode,
  LanguagePack,
  Lesson,
  LessonInput,
  MasteryRule,
  UnitInput,
  UnitWithLessons,
} from '@stufen/contracts';
import { candoKey, exerciseKey, lessonKey, stableId, unitKey } from './ids';

/** Key to id, for the descriptors and for the items of one pack. */
interface Lookup {
  candoIds: Map<string, string>;
  itemIds: Map<string, string>;
}

function levelRank(level: string): number {
  const index = (CEFR_LEVELS as readonly string[]).indexOf(level);
  return index === -1 ? CEFR_LEVELS.length : index;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ordinal order. Equal ordinals, which validation refuses, fall back to the key. */
function byOrdinal<T extends { ordinal: number; key: string }>(a: T, b: T): number {
  return a.ordinal - b.ordinal || byText(a.key, b.key);
}

function resolve(refs: string[], ids: Map<string, string>, what: string, where: string): string[] {
  return refs.map((ref) => {
    const id = ids.get(ref);
    if (id === undefined)
      throw new Error(`${where} refers to ${what} ${ref}, which is not in the pack`);
    return id;
  });
}

function toMasteryRule(rule: CandoInput['mastery_rule']): MasteryRule | null {
  if (rule === undefined) return null;
  return {
    ...(rule.evidence_count !== undefined && { evidenceCount: rule.evidence_count }),
    ...(rule.distinct_exercise_types !== undefined && {
      distinctExerciseTypes: rule.distinct_exercise_types,
    }),
    ...(rule.recent_accuracy !== undefined && { recentAccuracy: rule.recent_accuracy }),
    ...(rule.best_production_score !== undefined && {
      bestProductionScore: rule.best_production_score,
    }),
  };
}

function toCando(language: LanguageCode, cando: CandoInput): Cando {
  return {
    id: stableId(candoKey(language, cando)),
    languageCode: language,
    level: cando.level,
    skill: cando.skill,
    code: cando.code,
    textEn: cando.text_en,
    textNative: cando.text_native ?? null,
    source: cando.source,
    masteryRule: toMasteryRule(cando.mastery_rule),
  };
}

function toItem(language: LanguageCode, version: string, item: ItemInput): Item {
  return {
    id: stableId(item.key),
    languageCode: language,
    kind: item.kind,
    key: item.key,
    lemma: item.lemma,
    glossEn: item.gloss_en,
    level: item.level,
    frequencyRank: item.frequency_rank ?? null,
    payload: structuredClone(item.payload),
    packVersion: version,
  };
}

function toExercise(
  lookup: Lookup,
  version: string,
  lessonKeyValue: string,
  lessonId: string,
  exercise: ExerciseInput,
): Exercise {
  const key = exerciseKey(lessonKeyValue, exercise);
  return {
    id: stableId(key),
    lessonId,
    ordinal: exercise.ordinal,
    type: exercise.type,
    skill: exercise.skill,
    payload: structuredClone(exercise.payload),
    candoIds: resolve(exercise.cando_ids, lookup.candoIds, 'descriptor', `exercise ${key}`),
    itemIds: resolve(exercise.item_ids, lookup.itemIds, 'item', `exercise ${key}`),
    packVersion: version,
    instructionEn: exercise.instruction_en ?? null,
    instructionNative: exercise.instruction_native ?? null,
  };
}

function toLesson(
  language: LanguageCode,
  lookup: Lookup,
  version: string,
  unit: UnitInput,
  unitId: string,
  lesson: LessonInput,
): Lesson {
  const key = lessonKey(language, unit, lesson);
  const id = stableId(key);
  return {
    id,
    unitId,
    ordinal: lesson.ordinal,
    slug: lesson.slug,
    title: lesson.title,
    kind: lesson.kind,
    estimatedMinutes: lesson.estimated_minutes,
    candoIds: resolve(lesson.cando_ids, lookup.candoIds, 'descriptor', `lesson ${key}`),
    packVersion: version,
    titleEn: lesson.title_en ?? null,
    description: lesson.description ?? null,
    introducesItemIds: resolve(
      lesson.introduces_item_ids ?? [],
      lookup.itemIds,
      'item',
      `lesson ${key}`,
    ),
    exercises: [...lesson.exercises]
      .sort(byOrdinal)
      .map((exercise) => toExercise(lookup, version, key, id, exercise)),
  };
}

function toUnit(
  language: LanguageCode,
  lookup: Lookup,
  version: string,
  unit: UnitInput,
): UnitWithLessons {
  const id = stableId(unitKey(language, unit));
  return {
    id,
    languageCode: language,
    level: unit.level,
    ordinal: unit.ordinal,
    slug: unit.slug,
    title: unit.title,
    description: unit.description ?? null,
    packVersion: version,
    titleEn: unit.title_en ?? null,
    lessons: [...unit.lessons]
      .sort(byOrdinal)
      .map((lesson) => toLesson(language, lookup, version, unit, id, lesson)),
  };
}

/**
 * Builds what installPack hands to the SnapshotWriter. Ids are stableId of the
 * pack's keys (see ids.ts). References in `cando_ids` and `item_ids` become the
 * ids of those records, and so do the items a lesson lists in
 * `introduces_item_ids`. The optional text fields (`instruction_en`,
 * `instruction_native`, `title_en`, a lesson's `description`) are always set
 * in the snapshot, to null when the pack has none, so the same pack gives the
 * same shape. Units come out in level order, then ordinal order;
 * lessons and exercises in ordinal order; descriptors and items in pack order.
 *
 * Throws an Error for a reference that is not in the pack. validatePackData
 * reports the same thing without throwing, and installPack validates first.
 */
export function buildSnapshot(pack: LanguagePack): CurriculumSnapshot {
  const language = pack.code;
  const version = pack.version;
  const candoInputs = pack.loadCandos();
  const candos = candoInputs.map((cando) => toCando(language, cando));
  const items = pack.loadItems().map((item) => toItem(language, version, item));
  const lookup: Lookup = {
    // Same index in both lists: candos is a map over candoInputs.
    candoIds: new Map(
      candoInputs.map((cando, index) => [candoKey(language, cando), candos[index]?.id ?? '']),
    ),
    itemIds: new Map(items.map((item) => [item.key, item.id])),
  };
  const units = [...pack.loadUnits()]
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || byOrdinal(a, b))
    .map((unit) => toUnit(language, lookup, version, unit));
  return { language, version, candos, items, units };
}
