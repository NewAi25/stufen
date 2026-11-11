// Storage port for core-curriculum and its in memory adapter. The read port
// lists what this box needs from the tables `cando_descriptors`, `units`,
// `lessons`, `exercises` and `items` in docs/03-data-schema.md. The write port
// is what core-content calls when it installs a pack. The two boxes never
// import each other: the app hands the same store object to both. The
// Postgres adapter in postgres-store.ts implements the same interfaces, and
// tests/store-contract.ts holds the behaviour both adapters must show.
import type {
  Cando,
  CefrLevel,
  CurriculumSnapshot,
  Exercise,
  Item,
  LanguageCode,
  Lesson,
  LessonSummary,
  Skill,
  SnapshotWriter,
  Unit,
} from '@stufen/contracts';
import { byLevelThenCode, byLevelThenKey, byLevelThenOrdinal, byOrdinal } from './order';

/** Narrows listCandos. Omitted or undefined keys do not filter. */
export interface CandoFilter {
  level?: CefrLevel | undefined;
  skill?: Skill | undefined;
}

/**
 * Read side. "Level order" means the order of CEFR_LEVELS, A1 first. Every
 * list has a fixed order so that two adapters return the same thing.
 */
export interface CurriculumStore {
  /**
   * Descriptors of the language plus the common CEFR descriptors
   * (`languageCode` null) from every installed pack, each id once. Ordered by
   * level, then `code`, then `id`.
   */
  listCandos(language: LanguageCode, filter?: CandoFilter): Promise<Cando[]>;
  /** One descriptor from any language, or null when the id is unknown. */
  getCando(id: string): Promise<Cando | null>;
  /** Units of the language, by level and then `ordinal`. With `level`: that level only. */
  listUnits(language: LanguageCode, level?: CefrLevel): Promise<Unit[]>;
  /** Lessons of one unit without exercises, by `ordinal`. Empty when the unit is unknown. */
  listLessonSummaries(unitId: string): Promise<LessonSummary[]>;
  /** One lesson with its exercises by `ordinal`, or null when the id is unknown. */
  getLesson(lessonId: string): Promise<Lesson | null>;
  /** The items found, in the order the ids were asked for. Unknown and repeated ids are skipped. */
  getItems(ids: readonly string[]): Promise<Item[]>;
  /** Items of the language, by level and then `key`. With `level`: that level only. */
  listItems(language: LanguageCode, level?: CefrLevel): Promise<Item[]>;
  /** The unit a lesson belongs to, or null when the lesson id is unknown. */
  findLessonUnit(lessonId: string): Promise<Unit | null>;
  /** Version of the installed pack, or null when nothing is installed for the language. */
  activeVersion(language: LanguageCode): Promise<string | null>;
}

/**
 * Write side, used by core-content when a pack is installed. The same type as
 * `SnapshotWriter` in contracts, kept under its first name here.
 *
 * `replaceLanguage(snapshot)` replaces everything stored for
 * `snapshot.language` with the snapshot, in one step: readers see the old
 * content or the new content, never a mix. Other languages are left as they
 * are. Common descriptors (`languageCode` null) belong to no language: a
 * replace adds or updates the ones in the snapshot and never removes one.
 * A snapshot that holds a row of another language or a lesson or exercise that names the
 * wrong parent, is rejected with InvalidSnapshotError before anything is written.
 */
export type CurriculumWriter = SnapshotWriter;

/** Thrown by replaceLanguage, before anything is written, when the snapshot does not hold together. */
export class InvalidSnapshotError extends Error {
  constructor(language: LanguageCode, problem: string) {
    super(`Snapshot for "${language}" is not valid: ${problem}`);
    this.name = 'InvalidSnapshotError';
  }
}

/**
 * Both adapters call this first. Every unit and item must carry
 * `snapshot.language`, every cando must carry it or null, every lesson must
 * name the unit it sits in and every exercise the lesson it sits in, and no
 * id may appear twice among rows of one kind. So a wrong snapshot can never
 * reach the rows of another language.
 */
export function assertValidSnapshot(snapshot: CurriculumSnapshot): void {
  const { language } = snapshot;
  const fail = (problem: string): never => {
    throw new InvalidSnapshotError(language, problem);
  };
  const lessons = snapshot.units.flatMap((unit) => unit.lessons);
  const kinds = {
    cando: snapshot.candos,
    item: snapshot.items,
    unit: snapshot.units,
    lesson: lessons,
    exercise: lessons.flatMap((lesson) => lesson.exercises),
  };
  for (const [kind, rows] of Object.entries(kinds)) {
    const seen = new Set<string>();
    for (const { id } of rows) {
      if (seen.has(id)) fail(`${kind} ${id} appears twice`);
      seen.add(id);
    }
  }
  for (const cando of snapshot.candos) {
    if (cando.languageCode !== null && cando.languageCode !== language) {
      fail(`cando ${cando.id} belongs to "${cando.languageCode}"`);
    }
  }
  for (const item of snapshot.items) {
    if (item.languageCode !== language) fail(`item ${item.id} belongs to "${item.languageCode}"`);
  }
  for (const unit of snapshot.units) {
    if (unit.languageCode !== language) fail(`unit ${unit.id} belongs to "${unit.languageCode}"`);
    for (const lesson of unit.lessons) {
      if (lesson.unitId !== unit.id)
        fail(`lesson ${lesson.id} sits in unit ${unit.id} but names ${lesson.unitId}`);
      for (const exercise of lesson.exercises) {
        if (exercise.lessonId !== lesson.id) {
          fail(
            `exercise ${exercise.id} sits in lesson ${lesson.id} but names ${exercise.lessonId}`,
          );
        }
      }
    }
  }
}

// The optional fields (titleEn, description, introducesItemIds) are copied
// only when the snapshot carried them, so a row comes back as it was given.
function toUnit(unit: Unit): Unit {
  const plain: Unit = {
    id: unit.id,
    languageCode: unit.languageCode,
    level: unit.level,
    ordinal: unit.ordinal,
    slug: unit.slug,
    title: unit.title,
    description: unit.description,
    packVersion: unit.packVersion,
  };
  if (unit.titleEn !== undefined) plain.titleEn = unit.titleEn;
  return plain;
}

function toSummary(lesson: LessonSummary): LessonSummary {
  const summary: LessonSummary = {
    id: lesson.id,
    unitId: lesson.unitId,
    ordinal: lesson.ordinal,
    slug: lesson.slug,
    title: lesson.title,
    kind: lesson.kind,
    estimatedMinutes: lesson.estimatedMinutes,
    candoIds: [...lesson.candoIds],
    packVersion: lesson.packVersion,
  };
  if (lesson.titleEn !== undefined) summary.titleEn = lesson.titleEn;
  if (lesson.description !== undefined) summary.description = lesson.description;
  if (lesson.introducesItemIds !== undefined) {
    summary.introducesItemIds = [...lesson.introducesItemIds];
  }
  return summary;
}

function sortedExercises(exercises: readonly Exercise[]): Exercise[] {
  return structuredClone([...exercises].sort(byOrdinal));
}

/**
 * Keeps one snapshot per language in a map and the common descriptors in a
 * second map, for unit tests and local runs. Snapshots are copied on the way
 * in and rows are copied on the way out, so callers cannot change stored data
 * by mutating what they hold.
 */
export function createInMemoryCurriculumStore(): CurriculumStore & SnapshotWriter {
  const byLanguage = new Map<LanguageCode, CurriculumSnapshot>();
  /** Common descriptors by id. A replace adds to this map and never removes from it. */
  const common = new Map<string, Cando>();

  /** Every stored lesson with the unit that holds it. */
  function* lessonsWithUnits(): Generator<{ lesson: Lesson; unit: Unit }> {
    for (const snapshot of byLanguage.values()) {
      for (const unit of snapshot.units) {
        for (const lesson of unit.lessons) yield { lesson, unit };
      }
    }
  }

  function findLesson(lessonId: string): { lesson: Lesson; unit: Unit } | null {
    for (const entry of lessonsWithUnits()) {
      if (entry.lesson.id === lessonId) return entry;
    }
    return null;
  }

  return {
    async replaceLanguage(snapshot: CurriculumSnapshot): Promise<void> {
      assertValidSnapshot(snapshot);
      const copy = structuredClone(snapshot);
      for (const cando of copy.candos) {
        if (cando.languageCode === null) common.set(cando.id, cando);
      }
      copy.candos = copy.candos.filter((cando) => cando.languageCode !== null);
      // One map write: the old snapshot is swapped for the new one in a single step.
      byLanguage.set(copy.language, copy);
    },

    async activeVersion(language: LanguageCode): Promise<string | null> {
      return byLanguage.get(language)?.version ?? null;
    },

    async listCandos(language: LanguageCode, filter: CandoFilter = {}): Promise<Cando[]> {
      const own = byLanguage.get(language)?.candos ?? [];
      const found = [...own, ...common.values()].filter(
        (cando) =>
          (filter.level === undefined || cando.level === filter.level) &&
          (filter.skill === undefined || cando.skill === filter.skill),
      );
      return structuredClone(found.sort(byLevelThenCode));
    },

    async getCando(id: string): Promise<Cando | null> {
      const shared = common.get(id);
      if (shared) return structuredClone(shared);
      for (const snapshot of byLanguage.values()) {
        const cando = snapshot.candos.find((candidate) => candidate.id === id);
        if (cando) return structuredClone(cando);
      }
      return null;
    },

    async listUnits(language: LanguageCode, level?: CefrLevel): Promise<Unit[]> {
      const units = byLanguage.get(language)?.units ?? [];
      return units
        .filter((unit) => level === undefined || unit.level === level)
        .sort(byLevelThenOrdinal)
        .map(toUnit);
    },

    async listLessonSummaries(unitId: string): Promise<LessonSummary[]> {
      for (const snapshot of byLanguage.values()) {
        const unit = snapshot.units.find((candidate) => candidate.id === unitId);
        if (unit) return [...unit.lessons].sort(byOrdinal).map(toSummary);
      }
      return [];
    },

    async getLesson(lessonId: string): Promise<Lesson | null> {
      const entry = findLesson(lessonId);
      if (!entry) return null;
      return { ...toSummary(entry.lesson), exercises: sortedExercises(entry.lesson.exercises) };
    },

    async findLessonUnit(lessonId: string): Promise<Unit | null> {
      const entry = findLesson(lessonId);
      return entry ? toUnit(entry.unit) : null;
    },

    async getItems(ids: readonly string[]): Promise<Item[]> {
      const all = new Map<string, Item>();
      for (const snapshot of byLanguage.values()) {
        for (const item of snapshot.items) all.set(item.id, item);
      }
      const found: Item[] = [];
      for (const id of new Set(ids)) {
        const item = all.get(id);
        if (item) found.push(structuredClone(item));
      }
      return found;
    },

    async listItems(language: LanguageCode, level?: CefrLevel): Promise<Item[]> {
      const items = byLanguage.get(language)?.items ?? [];
      return structuredClone(
        items.filter((item) => level === undefined || item.level === level).sort(byLevelThenKey),
      );
    },
  };
}
