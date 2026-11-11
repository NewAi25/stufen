// Postgres adapter for the MasteryStore port (P1-31).
//
// Access model: every method runs inside withUser(db, userId, fn) for the user
// it acts for, as the restricted role stufen_app with row level security on.
// A statement can then only see and change that user's rows in cando_mastery,
// cando_outcomes, level_estimates and streaks. The owner connection is never
// used for learner data here.
//
// What the tables give and what they do not:
//   * cando_mastery.updated_at is set by the trigger cando_mastery_updated on
//     every update, so after a replace the row carries the database clock,
//     not the caller's `updatedAt`. The first insert keeps the caller's value.
//   * cando_mastery has no column for the order rows were first written, so
//     listMastery orders by descriptor id.
//   * cando_outcomes and level_estimates are append only for stufen_app (no
//     update, no delete). Their only order column is created_at, so an append
//     never stores a time at or before the newest row of the same history:
//     it is moved one microsecond past it. See appendAfterNewest.
//   * numeric columns keep 2 decimals (best_production_score) or 3 decimals
//     (recent_accuracy, confidence). pg returns them as strings.
//   * streaks.last_active_date is a date. It is written and read as a plain
//     YYYY-MM-DD string and never passes through a JavaScript Date.
import { CEFR_LEVELS, EXERCISE_TYPES, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  CandoMastery,
  CefrLevel,
  ExerciseTypeId,
  LanguageCode,
  LevelEstimate,
  LevelEstimateMethod,
  Streak,
} from '@stufen/contracts';
import { sql, withUser } from '@stufen/db';
import type { Database, DatabaseTransaction, NewRow, Row } from '@stufen/db';
import { OUTCOME_HISTORY_LIMIT } from './store';
import type { AttemptOutcome, MasteryStore } from './store';

// ---------- mapping: the one place that knows the column names ----------

function toLanguageCode(value: string): LanguageCode {
  const found = LANGUAGE_CODES.find((code) => code === value);
  if (!found) throw new Error(`Language code "${value}" in the database is not in LANGUAGE_CODES`);
  return found;
}

function toCefrLevel(value: string): CefrLevel {
  const found = CEFR_LEVELS.find((level) => level === value);
  if (!found) throw new Error(`CEFR level "${value}" in the database is not in CEFR_LEVELS`);
  return found;
}

function toExerciseType(value: string): ExerciseTypeId {
  const found = EXERCISE_TYPES.find((type) => type === value);
  if (!found) throw new Error(`Exercise type "${value}" in the database is not in EXERCISE_TYPES`);
  return found;
}

/** A numeric column as a number. pg hands numeric over as a string. */
function toNumber(value: string | number, column: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Column ${column} holds "${value}", not a number`);
  return parsed;
}

/** A `cando_mastery` row as the contracts CandoMastery. Timestamps become ISO strings. */
export function masteryFromRow(row: Row<'cando_mastery'>): CandoMastery {
  return {
    userId: row.user_id,
    candoId: row.cando_id,
    evidenceCount: row.evidence_count,
    correctCount: row.correct_count,
    exerciseTypesSeen: row.exercise_types_seen.map(toExerciseType),
    bestProductionScore:
      row.best_production_score === null
        ? null
        : toNumber(row.best_production_score, 'cando_mastery.best_production_score'),
    recentAccuracy:
      row.recent_accuracy === null
        ? null
        : toNumber(row.recent_accuracy, 'cando_mastery.recent_accuracy'),
    masteredAt: row.mastered_at === null ? null : row.mastered_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** The contracts CandoMastery as the values of an insert. */
export function masteryToRow(row: CandoMastery): NewRow<'cando_mastery'> {
  return {
    user_id: row.userId,
    cando_id: row.candoId,
    evidence_count: row.evidenceCount,
    correct_count: row.correctCount,
    // A copy, so the driver never holds the caller's array.
    exercise_types_seen: [...row.exerciseTypesSeen],
    best_production_score: row.bestProductionScore,
    recent_accuracy: row.recentAccuracy,
    mastered_at: row.masteredAt,
    updated_at: row.updatedAt,
  };
}

// ---------- statements: each runs inside a withUser transaction ----------
// Exported for the integration test, which runs them as one user against
// another user's rows. They are not part of the public surface in index.ts.

/** The row of this user and descriptor, if the user of the transaction may see it. */
export async function selectMastery(
  trx: DatabaseTransaction,
  userId: string,
  candoId: string,
): Promise<CandoMastery | null> {
  const row = await trx
    .selectFrom('cando_mastery')
    .selectAll()
    .where('user_id', '=', userId)
    .where('cando_id', '=', candoId)
    .executeTakeFirst();
  return row ? masteryFromRow(row) : null;
}

/** Every visible row of the user, ordered by descriptor id. */
export async function selectMasteryRows(
  trx: DatabaseTransaction,
  userId: string,
): Promise<CandoMastery[]> {
  const rows = await trx
    .selectFrom('cando_mastery')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('cando_id', 'asc')
    .execute();
  return rows.map(masteryFromRow);
}

/**
 * Inserts the row, or replaces every column of the row with the same user and
 * descriptor. On a replace the trigger sets updated_at to the database clock.
 */
export async function upsertMasteryRow(trx: DatabaseTransaction, row: CandoMastery): Promise<void> {
  const values = masteryToRow(row);
  await trx
    .insertInto('cando_mastery')
    .values(values)
    .onConflict((conflict) =>
      conflict.columns(['user_id', 'cando_id']).doUpdateSet({
        evidence_count: row.evidenceCount,
        correct_count: row.correctCount,
        exercise_types_seen: [...row.exerciseTypesSeen],
        best_production_score: row.bestProductionScore,
        recent_accuracy: row.recentAccuracy,
        mastered_at: row.masteredAt,
        updated_at: row.updatedAt,
      }),
    )
    .execute();
}

/**
 * Queues the appends to one history (the outcomes of a user and descriptor,
 * or the estimates of a user and language) until the transaction ends. Two
 * appends racing for the same history then never read the same newest row.
 */
async function lockHistory(trx: DatabaseTransaction, key: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(trx);
}

/**
 * Appends one attempt. The port promises append order, and created_at is the
 * only order column, so the stored time is the later of `outcome.at` and one
 * microsecond past the newest attempt of the same history. Attempts that
 * carry the same millisecond keep their order and still read back with that
 * millisecond. An attempt whose time lies before the newest stored one (a
 * clock that went backwards) is stored just after it.
 */
export async function insertOutcome(
  trx: DatabaseTransaction,
  userId: string,
  candoId: string,
  outcome: AttemptOutcome,
): Promise<void> {
  await lockHistory(trx, `core-progress.outcomes:${userId}:${candoId}`);
  await sql`
    insert into cando_outcomes (user_id, cando_id, correct, exercise_type, created_at)
    select ${userId}::uuid, ${candoId}::uuid, ${outcome.correct}, ${outcome.exerciseType},
      greatest(
        ${outcome.at}::timestamptz,
        (select max(created_at) + interval '1 microsecond'
           from cando_outcomes
          where user_id = ${userId}::uuid and cando_id = ${candoId}::uuid)
      )
  `.execute(trx);
}

/**
 * The newest `limit` attempts of the user and descriptor, oldest first, as the
 * in memory adapter returns them. Never more than OUTCOME_HISTORY_LIMIT,
 * which is all the in memory adapter keeps.
 */
export async function selectRecentOutcomes(
  trx: DatabaseTransaction,
  userId: string,
  candoId: string,
  limit: number,
): Promise<AttemptOutcome[]> {
  const rows = await trx
    .selectFrom('cando_outcomes')
    .select(['correct', 'exercise_type', 'created_at'])
    .where('user_id', '=', userId)
    .where('cando_id', '=', candoId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(Math.min(limit, OUTCOME_HISTORY_LIMIT))
    .execute();
  return rows.reverse().map((row) => ({
    correct: row.correct,
    exerciseType: toExerciseType(row.exercise_type),
    at: row.created_at.toISOString(),
  }));
}

const METHODS: readonly LevelEstimateMethod[] = [
  'placement',
  'checkpoint',
  'mastery_ratio',
  'manual',
];

/** A `level_estimates` row as the contracts LevelEstimate. The row id is not part of it. */
export function estimateFromRow(row: Row<'level_estimates'>): LevelEstimate {
  const method = METHODS.find((candidate) => candidate === row.method);
  if (!method) throw new Error(`Estimate method "${row.method}" in the database is not known`);
  return {
    userId: row.user_id,
    languageCode: toLanguageCode(row.language_code),
    level: toCefrLevel(row.level),
    confidence: toNumber(row.confidence, 'level_estimates.confidence'),
    method,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Appends one estimate. As with insertOutcome, the stored created_at is the
 * later of `estimate.createdAt` and one microsecond past the newest estimate
 * of the same user and language, so "appended last" has one answer.
 */
export async function insertEstimateRow(
  trx: DatabaseTransaction,
  estimate: LevelEstimate,
): Promise<void> {
  const { userId, languageCode } = estimate;
  await lockHistory(trx, `core-progress.estimates:${userId}:${languageCode}`);
  await sql`
    insert into level_estimates (user_id, language_code, level, confidence, method, created_at)
    select ${userId}::uuid, ${languageCode}, ${estimate.level}, ${estimate.confidence},
      ${estimate.method},
      greatest(
        ${estimate.createdAt}::timestamptz,
        (select max(created_at) + interval '1 microsecond'
           from level_estimates
          where user_id = ${userId}::uuid and language_code = ${languageCode})
      )
  `.execute(trx);
}

/** Every visible estimate of the user and language, in the order they were appended. */
export async function selectEstimates(
  trx: DatabaseTransaction,
  userId: string,
  language: LanguageCode,
): Promise<LevelEstimate[]> {
  const rows = await trx
    .selectFrom('level_estimates')
    .selectAll()
    .where('user_id', '=', userId)
    .where('language_code', '=', language)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return rows.map(estimateFromRow);
}

/** The estimate appended last for the user and language, or null. */
export async function selectLatestEstimate(
  trx: DatabaseTransaction,
  userId: string,
  language: LanguageCode,
): Promise<LevelEstimate | null> {
  const row = await trx
    .selectFrom('level_estimates')
    .selectAll()
    .where('user_id', '=', userId)
    .where('language_code', '=', language)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row ? estimateFromRow(row) : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored streak of the user and language, with the day as YYYY-MM-DD. */
export async function selectStreak(
  trx: DatabaseTransaction,
  userId: string,
  language: LanguageCode,
): Promise<Streak | null> {
  const row = await trx
    .selectFrom('streaks')
    .select(['user_id', 'language_code', 'current_days', 'longest_days'])
    // Formatted by Postgres. Selecting the date itself would make pg build a
    // Date at local midnight, which is the day before in UTC east of Greenwich.
    .select(sql<string | null>`to_char(last_active_date, 'YYYY-MM-DD')`.as('last_active_day'))
    .where('user_id', '=', userId)
    .where('language_code', '=', language)
    .executeTakeFirst();
  if (!row) return null;
  return {
    userId: row.user_id,
    languageCode: toLanguageCode(row.language_code),
    currentDays: row.current_days,
    longestDays: row.longest_days,
    lastActiveDate: row.last_active_day,
  };
}

/** Inserts the row, or replaces the row with the same user and language. */
export async function upsertStreakRow(trx: DatabaseTransaction, streak: Streak): Promise<void> {
  const day = streak.lastActiveDate;
  if (day !== null && !DAY.test(day)) {
    throw new TypeError(`lastActiveDate must be a YYYY-MM-DD string or null, got "${day}"`);
  }
  await trx
    .insertInto('streaks')
    .values({
      user_id: streak.userId,
      language_code: streak.languageCode,
      current_days: streak.currentDays,
      longest_days: streak.longestDays,
      last_active_date: day,
    })
    .onConflict((conflict) =>
      conflict.columns(['user_id', 'language_code']).doUpdateSet({
        current_days: streak.currentDays,
        longest_days: streak.longestDays,
        last_active_date: day,
      }),
    )
    .execute();
}

// ---------- the adapter ----------

/**
 * MasteryStore on PostgreSQL. `db` is the handle from createDb. Each method
 * opens its own withUser transaction for the user id it is given, so a user
 * id that is not a uuid is rejected before any query runs.
 */
export function createPostgresMasteryStore(db: Database): MasteryStore {
  return {
    getMastery: (userId, candoId) =>
      withUser(db, userId, (trx) => selectMastery(trx, userId, candoId)),
    upsertMastery: (row) => withUser(db, row.userId, (trx) => upsertMasteryRow(trx, row)),
    listMastery: (userId) => withUser(db, userId, (trx) => selectMasteryRows(trx, userId)),
    appendAttemptOutcome: (userId, candoId, outcome) =>
      withUser(db, userId, (trx) => insertOutcome(trx, userId, candoId, outcome)),
    async recentOutcomes(userId, candoId, limit) {
      if (!Number.isInteger(limit) || limit <= 0) return [];
      return withUser(db, userId, (trx) => selectRecentOutcomes(trx, userId, candoId, limit));
    },
    insertEstimate: (estimate) =>
      withUser(db, estimate.userId, (trx) => insertEstimateRow(trx, estimate)),
    latestEstimate: (userId, language) =>
      withUser(db, userId, (trx) => selectLatestEstimate(trx, userId, language)),
    listEstimates: (userId, language) =>
      withUser(db, userId, (trx) => selectEstimates(trx, userId, language)),
    getStreak: (userId, language) =>
      withUser(db, userId, (trx) => selectStreak(trx, userId, language)),
    upsertStreak: (streak) => withUser(db, streak.userId, (trx) => upsertStreakRow(trx, streak)),
  };
}
