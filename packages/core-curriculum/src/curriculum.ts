// The curriculum service: the read side of the CEFR spine. Built by a factory
// so the store is injected. No module level state. Every ordering promised
// here is applied here too, so it holds for any CurriculumStore adapter.
import { CEFR_LEVELS } from '@stufen/contracts';
import type {
  Cando,
  CefrLevel,
  LanguageCode,
  Lesson,
  LessonSummary,
  Skill,
  Unit,
} from '@stufen/contracts';
import type { CurriculumStore } from './store';

/** What a CurriculumNotFoundError was looking for. */
export type CurriculumNotFoundKind = 'cando' | 'lesson';

/** Thrown by getCando and getLesson when the id is not in the store. */
export class CurriculumNotFoundError extends Error {
  readonly kind: CurriculumNotFoundKind;
  readonly id: string;

  constructor(kind: CurriculumNotFoundKind, id: string) {
    super(`${kind} ${id} not found`);
    this.name = 'CurriculumNotFoundError';
    this.kind = kind;
    this.id = id;
  }
}

/** One step of lessonPath: a lesson with the unit and level it sits in. */
export interface LessonPathEntry {
  lesson: LessonSummary;
  unit: Unit;
  level: CefrLevel;
}

export interface CreateCurriculumOptions {
  store: CurriculumStore;
}

export interface CurriculumService {
  /** The six CEFR levels, A1 first. A fresh array on every call. */
  listLevels(): CefrLevel[];
  /**
   * Descriptors of the language plus the common CEFR descriptors, by level
   * and then `code`. `level` and `skill` narrow the list when given.
   */
  listCandos(language: LanguageCode, level?: CefrLevel, skill?: Skill): Promise<Cando[]>;
  /** Rejects with CurriculumNotFoundError (kind 'cando') when the id is unknown. */
  getCando(candoId: string): Promise<Cando>;
  /** Units of one level in `ordinal` order. */
  listUnits(language: LanguageCode, level: CefrLevel): Promise<Unit[]>;
  /** Lessons of one unit in `ordinal` order, without exercises. Empty when the unit is unknown. */
  listLessons(unitId: string): Promise<LessonSummary[]>;
  /**
   * One lesson with its exercises in `ordinal` order. Rejects with
   * CurriculumNotFoundError (kind 'lesson') when the id is unknown.
   */
  getLesson(lessonId: string): Promise<Lesson>;
  /**
   * Every lesson of the language in learning order: by level, then unit
   * `ordinal`, then lesson `ordinal`. A later row walks this list to find the
   * next lesson for a learner.
   */
  lessonPath(language: LanguageCode): Promise<LessonPathEntry[]>;
}

const LEVEL_RANK: Record<CefrLevel, number> = Object.fromEntries(
  CEFR_LEVELS.map((level, index) => [level, index]),
) as Record<CefrLevel, number>;

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Ties on `ordinal` fall back to the id, so the order is the same on every call.
function byOrdinal<T extends { ordinal: number; id: string }>(a: T, b: T): number {
  return a.ordinal - b.ordinal || byText(a.id, b.id);
}

function byLevelThenOrdinal(a: Unit, b: Unit): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byOrdinal(a, b);
}

export function createCurriculum(options: CreateCurriculumOptions): CurriculumService {
  const { store } = options;

  return {
    listLevels(): CefrLevel[] {
      return [...CEFR_LEVELS];
    },

    async listCandos(language: LanguageCode, level?: CefrLevel, skill?: Skill): Promise<Cando[]> {
      const candos = await store.listCandos(language, { level, skill });
      return [...candos].sort(
        (a, b) =>
          LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byText(a.code, b.code) || byText(a.id, b.id),
      );
    },

    async getCando(candoId: string): Promise<Cando> {
      const cando = await store.getCando(candoId);
      if (!cando) throw new CurriculumNotFoundError('cando', candoId);
      return cando;
    },

    async listUnits(language: LanguageCode, level: CefrLevel): Promise<Unit[]> {
      const units = await store.listUnits(language, level);
      return [...units].sort(byOrdinal);
    },

    async listLessons(unitId: string): Promise<LessonSummary[]> {
      const lessons = await store.listLessonSummaries(unitId);
      return [...lessons].sort(byOrdinal);
    },

    async getLesson(lessonId: string): Promise<Lesson> {
      const lesson = await store.getLesson(lessonId);
      if (!lesson) throw new CurriculumNotFoundError('lesson', lessonId);
      return { ...lesson, exercises: [...lesson.exercises].sort(byOrdinal) };
    },

    async lessonPath(language: LanguageCode): Promise<LessonPathEntry[]> {
      const units = [...(await store.listUnits(language))].sort(byLevelThenOrdinal);
      const path: LessonPathEntry[] = [];
      for (const unit of units) {
        const lessons = [...(await store.listLessonSummaries(unit.id))].sort(byOrdinal);
        for (const lesson of lessons) path.push({ lesson, unit, level: unit.level });
      }
      return path;
    },
  };
}
