// Storage port for core-curriculum and its in memory adapter. The read port
// lists what this box needs from the tables `cando_descriptors`, `units`,
// `lessons`, `exercises` and `items` in docs/03-data-schema.md. The write port
// is what core-content calls when it installs a pack. The two boxes never
// import each other: the app hands the same store object to both. The
// Postgres adapter (a later row) implements the same interfaces.
import { CEFR_LEVELS } from '@stufen/contracts';
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
  Unit,
} from '@stufen/contracts';

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

/** Write side, used by core-content when a pack is installed. */
export interface CurriculumWriter {
  /**
   * Replaces everything stored for `snapshot.language` with the snapshot, in
   * one step: readers see the old content or the new content, never a mix.
   * Other languages are left as they are.
   */
  replaceLanguage(snapshot: CurriculumSnapshot): Promise<void>;
}

const LEVEL_RANK: Record<CefrLevel, number> = Object.fromEntries(
  CEFR_LEVELS.map((level, index) => [level, index]),
) as Record<CefrLevel, number>;

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byOrdinal<T extends { ordinal: number; id: string }>(a: T, b: T): number {
  return a.ordinal - b.ordinal || byText(a.id, b.id);
}

function toUnit(unit: Unit): Unit {
  return {
    id: unit.id,
    languageCode: unit.languageCode,
    level: unit.level,
    ordinal: unit.ordinal,
    slug: unit.slug,
    title: unit.title,
    description: unit.description,
    packVersion: unit.packVersion,
  };
}

function toSummary(lesson: LessonSummary): LessonSummary {
  return {
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
}

function sortedExercises(exercises: readonly Exercise[]): Exercise[] {
  return structuredClone([...exercises].sort(byOrdinal));
}

/**
 * Keeps one snapshot per language in a map, for unit tests and local runs.
 * Snapshots are copied on the way in and rows are copied on the way out, so
 * callers cannot change stored data by mutating what they hold.
 */
export function createInMemoryCurriculumStore(): CurriculumStore & CurriculumWriter {
  const byLanguage = new Map<LanguageCode, CurriculumSnapshot>();

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
      // One map write: the old snapshot is swapped for the new one in a single step.
      byLanguage.set(snapshot.language, structuredClone(snapshot));
    },

    async activeVersion(language: LanguageCode): Promise<string | null> {
      return byLanguage.get(language)?.version ?? null;
    },

    async listCandos(language: LanguageCode, filter: CandoFilter = {}): Promise<Cando[]> {
      // The asked language goes first, so its copy of a common descriptor wins
      // when two packs carry the same id.
      const own = byLanguage.get(language);
      const snapshots = [...(own ? [own] : []), ...byLanguage.values()];
      const found = new Map<string, Cando>();
      for (const snapshot of snapshots) {
        for (const cando of snapshot.candos) {
          if (cando.languageCode !== null && cando.languageCode !== language) continue;
          if (filter.level !== undefined && cando.level !== filter.level) continue;
          if (filter.skill !== undefined && cando.skill !== filter.skill) continue;
          if (!found.has(cando.id)) found.set(cando.id, cando);
        }
      }
      return structuredClone(
        [...found.values()].sort(
          (a, b) =>
            LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
            byText(a.code, b.code) ||
            byText(a.id, b.id),
        ),
      );
    },

    async getCando(id: string): Promise<Cando | null> {
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
        .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byOrdinal(a, b))
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
        items
          .filter((item) => level === undefined || item.level === level)
          .sort(
            (a, b) =>
              LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
              byText(a.key, b.key) ||
              byText(a.id, b.id),
          ),
      );
    },
  };
}
