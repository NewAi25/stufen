// Storage port for core-progress and its in memory adapter. The port lists
// the reads and writes this box needs from the `cando_mastery`,
// `level_estimates` and `streaks` tables in docs/03-data-schema.md, plus the
// short attempt history the mastery rule needs for recent accuracy, which
// lives in `cando_outcomes`. The Postgres adapter in postgres-store.ts
// implements the same interface, and tests/store-contract.ts holds the
// behaviour both adapters share.
import type {
  CandoMastery,
  ExerciseTypeId,
  LanguageCode,
  LevelEstimate,
  Streak,
} from '@stufen/contracts';

/** One attempt against one descriptor, as far as the mastery rule cares. */
export interface AttemptOutcome {
  correct: boolean;
  exerciseType: ExerciseTypeId;
  /** ISO timestamp of the attempt. */
  at: string;
}

export interface MasteryStore {
  /** The row for one user and one descriptor, or null when there is no evidence yet. */
  getMastery(userId: string, candoId: string): Promise<CandoMastery | null>;
  /**
   * Inserts the row, or replaces the row with the same `userId` and `candoId`.
   * On a replace an adapter may set `updatedAt` from its own clock (Postgres
   * does, through a trigger); every other field is stored as given.
   */
  upsertMastery(row: CandoMastery): Promise<void>;
  /**
   * Every mastery row of the user. The order is stable but belongs to the
   * adapter: in memory it is the order the rows were first written, Postgres
   * orders by descriptor id. Callers that need an order sort the rows.
   */
  listMastery(userId: string): Promise<CandoMastery[]>;
  /** Appends one attempt to the history of a user and descriptor. */
  appendAttemptOutcome(userId: string, candoId: string, outcome: AttemptOutcome): Promise<void>;
  /**
   * The last `limit` attempts of a user and descriptor in the order they were
   * appended, oldest first. Never more than OUTCOME_HISTORY_LIMIT. Empty when
   * `limit` is not a positive integer.
   */
  recentOutcomes(userId: string, candoId: string, limit: number): Promise<AttemptOutcome[]>;
  /** Appends one estimate. Estimates are never changed or removed. */
  insertEstimate(estimate: LevelEstimate): Promise<void>;
  /** The estimate appended last for the user and language, or null. */
  latestEstimate(userId: string, language: LanguageCode): Promise<LevelEstimate | null>;
  /** Every estimate of the user and language, in the order they were appended. */
  listEstimates(userId: string, language: LanguageCode): Promise<LevelEstimate[]>;
  /** The streak row for the user and language, or null when there is none yet. */
  getStreak(userId: string, language: LanguageCode): Promise<Streak | null>;
  /** Inserts the row, or replaces the row with the same `userId` and `languageCode`. */
  upsertStreak(streak: Streak): Promise<void>;
}

/**
 * No adapter returns more attempts per descriptor than this. The in memory
 * adapter also keeps no more; Postgres keeps every row and reads the newest.
 */
export const OUTCOME_HISTORY_LIMIT = 50;

/**
 * Keeps rows in maps for unit tests and local runs. Rows are copied on the
 * way in and on the way out, so callers cannot change stored data by mutating
 * what they hold.
 */
export function createInMemoryMasteryStore(): MasteryStore {
  // Map keeps insertion order, which is the order the port promises.
  const mastery = new Map<string, CandoMastery>();
  const outcomes = new Map<string, AttemptOutcome[]>();
  const estimates: LevelEstimate[] = [];
  const streaks = new Map<string, Streak>();

  // JSON.stringify of a pair cannot collide, whatever characters the ids hold.
  const key = (a: string, b: string): string => JSON.stringify([a, b]);

  function estimatesOf(userId: string, language: LanguageCode): LevelEstimate[] {
    return estimates.filter((row) => row.userId === userId && row.languageCode === language);
  }

  return {
    async getMastery(userId, candoId) {
      const row = mastery.get(key(userId, candoId));
      return row ? structuredClone(row) : null;
    },

    async upsertMastery(row) {
      mastery.set(key(row.userId, row.candoId), structuredClone(row));
    },

    async listMastery(userId) {
      return [...mastery.values()]
        .filter((row) => row.userId === userId)
        .map((row) => structuredClone(row));
    },

    async appendAttemptOutcome(userId, candoId, outcome) {
      const k = key(userId, candoId);
      const history = outcomes.get(k) ?? [];
      history.push({ ...outcome });
      outcomes.set(k, history.slice(-OUTCOME_HISTORY_LIMIT));
    },

    async recentOutcomes(userId, candoId, limit) {
      if (!Number.isInteger(limit) || limit <= 0) return [];
      const history = outcomes.get(key(userId, candoId)) ?? [];
      return history.slice(-limit).map((outcome) => ({ ...outcome }));
    },

    async insertEstimate(estimate) {
      estimates.push(structuredClone(estimate));
    },

    async latestEstimate(userId, language) {
      const last = estimatesOf(userId, language).at(-1);
      return last ? structuredClone(last) : null;
    },

    async listEstimates(userId, language) {
      return estimatesOf(userId, language).map((row) => structuredClone(row));
    },

    async getStreak(userId, language) {
      const row = streaks.get(key(userId, language));
      return row ? { ...row } : null;
    },

    async upsertStreak(streak) {
      streaks.set(key(streak.userId, streak.languageCode), { ...streak });
    },
  };
}
