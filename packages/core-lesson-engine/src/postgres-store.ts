// Postgres adapter for the SessionStore port (P1-13).
//
// Access model: every read and write runs inside withUser(db, userId, fn), as
// the restricted role stufen_app with row level security on, so a statement
// can only see and change the rows of the user it runs for. The owner
// connection is never used for learner data here. Content (`lessons`, `units`)
// is only read, which the content policies allow every learner.
//
// `lesson_sessions` has no language column. The language of a session is read
// from the unit of its lesson (units.language_code) on every read, and the
// `language` of a session handed to insertSession is not stored.
import { EXERCISE_TYPES, LANGUAGE_CODES } from '@stufen/contracts';
import type { ExerciseTypeId, Feedback, LanguageCode } from '@stufen/contracts';
import { sql, withUser } from '@stufen/db';
import type { Database, DatabaseTransaction, NewRow, Row, RowPatch } from '@stufen/db';
import { DuplicateAttemptError } from './store';
import type { SessionPatch, SessionStore, StoredAttempt, StoredSession } from './store';

// ---------- mapping: the one place that knows the column names ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that is not a uuid cannot name a row, so reads treat it as unknown. */
function isUuid(value: string): boolean {
  return UUID.test(value);
}

function toLanguageCode(value: string): LanguageCode {
  const found = LANGUAGE_CODES.find((code) => code === value);
  if (!found) throw new Error(`Language code "${value}" in the database is not in LANGUAGE_CODES`);
  return found;
}

function toExerciseType(value: string): ExerciseTypeId {
  const found = EXERCISE_TYPES.find((type) => type === value);
  if (!found) throw new Error(`Exercise type "${value}" in the database is not in EXERCISE_TYPES`);
  return found;
}

/** A `lesson_sessions` row joined with the language of its lesson's unit. */
export type SessionRow = Row<'lesson_sessions'> & { language_code: string };

/** Timestamps become ISO strings, the numeric score becomes a number. */
export function sessionFromRow(row: SessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    lessonId: row.lesson_id,
    language: toLanguageCode(row.language_code),
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at === null ? null : row.completed_at.toISOString(),
    score: row.score === null ? null : Number(row.score),
    exerciseOrder: [...row.exercise_order],
  };
}

/** The columns of a new session. The language is not among them. */
export function sessionToColumns(session: StoredSession): NewRow<'lesson_sessions'> {
  return {
    id: session.id,
    user_id: session.userId,
    lesson_id: session.lessonId,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    score: session.score,
    exercise_order: session.exerciseOrder,
  };
}

/** Built field by field from the known keys, so an extra key never reaches the query. */
export function sessionPatchToColumns(patch: SessionPatch): RowPatch<'lesson_sessions'> {
  const columns: RowPatch<'lesson_sessions'> = {};
  if (patch.completedAt !== undefined) columns.completed_at = patch.completedAt;
  if (patch.score !== undefined) columns.score = patch.score;
  return columns;
}

/**
 * The feedback column has no null: `{}`, its default, stands for "none". Any
 * other value without a message string also reads as null.
 */
function feedbackFromColumn(value: unknown): Feedback | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('message' in value) || typeof value.message !== 'string') return null;
  return { ...value, message: value.message };
}

/** The numeric score becomes a number, `created_at` an ISO string. */
export function attemptFromRow(row: Row<'attempts'>): StoredAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    itemId: row.item_id,
    exerciseType: toExerciseType(row.exercise_type),
    correct: row.correct,
    score: Number(row.score),
    response: row.response,
    feedback: feedbackFromColumn(row.feedback),
    durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Both jsonb values go through JSON.stringify: pg would send a bare array as a
 * Postgres array and a bare string as JSON text. A null response is stored as
 * JSON null, a null feedback as `{}`.
 */
export function attemptToColumns(attempt: StoredAttempt): NewRow<'attempts'> {
  return {
    id: attempt.id,
    user_id: attempt.userId,
    session_id: attempt.sessionId,
    exercise_id: attempt.exerciseId,
    item_id: attempt.itemId,
    exercise_type: attempt.exerciseType,
    correct: attempt.correct,
    score: attempt.score,
    response: JSON.stringify(attempt.response ?? null),
    feedback: JSON.stringify(attempt.feedback ?? {}),
    duration_ms: attempt.durationMs,
    created_at: attempt.createdAt,
  };
}

// ---------- statements: each runs inside a withUser transaction ----------
// Exported for the integration test, which runs them as one user against
// another user's rows. They are not part of the public surface in index.ts.

function pgCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** Sessions joined to lessons and units, so each row carries its language. */
function sessionsWithLanguage(trx: DatabaseTransaction) {
  return trx
    .selectFrom('lesson_sessions as s')
    .innerJoin('lessons as l', 'l.id', 's.lesson_id')
    .innerJoin('units as u', 'u.id', 'l.unit_id')
    .select([
      's.id',
      's.user_id',
      's.lesson_id',
      's.started_at',
      's.completed_at',
      's.score',
      's.exercise_order',
      'u.language_code',
    ]);
}

/** The session with this id for this user, if the user of the transaction may see it. */
export async function selectSession(
  trx: DatabaseTransaction,
  userId: string,
  id: string,
): Promise<StoredSession | null> {
  if (!isUuid(userId) || !isUuid(id)) return null;
  const row = await sessionsWithLanguage(trx)
    .where('s.id', '=', id)
    .where('s.user_id', '=', userId)
    .executeTakeFirst();
  return row ? sessionFromRow(row) : null;
}

/** Inserts the row and reads it back with its language. */
export async function insertSessionRow(
  trx: DatabaseTransaction,
  session: StoredSession,
): Promise<StoredSession> {
  await trx.insertInto('lesson_sessions').values(sessionToColumns(session)).execute();
  const stored = await selectSession(trx, session.userId, session.id);
  if (!stored) throw new Error(`lesson session ${session.id} could not be read back`);
  return stored;
}

/** Applies the patch to the user's session. Null when no such row is visible. */
export async function patchSession(
  trx: DatabaseTransaction,
  userId: string,
  id: string,
  patch: SessionPatch,
): Promise<StoredSession | null> {
  if (!isUuid(userId) || !isUuid(id)) return null;
  const columns = sessionPatchToColumns(patch);
  if (Object.keys(columns).length > 0) {
    const changed = await trx
      .updateTable('lesson_sessions')
      .set(columns)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .returning('id')
      .executeTakeFirst();
    if (!changed) return null;
  }
  return selectSession(trx, userId, id);
}

/** Oldest first by started_at, then by id. */
export async function selectSessionsByUser(
  trx: DatabaseTransaction,
  userId: string,
): Promise<StoredSession[]> {
  if (!isUuid(userId)) return [];
  const rows = await sessionsWithLanguage(trx)
    .where('s.user_id', '=', userId)
    .orderBy('s.started_at', 'asc')
    .orderBy('s.id', 'asc')
    .execute();
  return rows.map(sessionFromRow);
}

/** Distinct lesson ids of the user's completed sessions, ascending. */
export async function selectCompletedLessonIds(
  trx: DatabaseTransaction,
  userId: string,
): Promise<string[]> {
  if (!isUuid(userId)) return [];
  const rows = await trx
    .selectFrom('lesson_sessions')
    .select('lesson_id')
    .distinct()
    .where('user_id', '=', userId)
    .where('completed_at', 'is not', null)
    .orderBy('lesson_id', 'asc')
    .execute();
  return rows.map((row) => row.lesson_id);
}

/**
 * Inserts one attempt. For a session attempt it first checks, under a lock per
 * session and exercise, that the session is the user's own and holds no
 * attempt for the exercise yet. The table has no unique constraint for that,
 * and its foreign key to lesson_sessions is not subject to row security, so
 * both rules are kept here.
 */
export async function insertAttemptRow(
  trx: DatabaseTransaction,
  attempt: StoredAttempt,
): Promise<StoredAttempt> {
  const { sessionId, exerciseId } = attempt;
  if (sessionId !== null) {
    const session = await selectSession(trx, attempt.userId, sessionId);
    if (!session) {
      throw new Error(`user ${attempt.userId} has no lesson session ${sessionId}`);
    }
  }
  if (sessionId !== null && exerciseId !== null) {
    // Two inserts racing for the same exercise queue up here until the first commits.
    const lockKey = `core-lesson-engine.attempt:${sessionId}:${exerciseId}`;
    await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(trx);
    const taken = await trx
      .selectFrom('attempts')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('exercise_id', '=', exerciseId)
      .executeTakeFirst();
    if (taken) throw new DuplicateAttemptError(sessionId, exerciseId);
  }
  const row = await trx
    .insertInto('attempts')
    .values(attemptToColumns(attempt))
    .returningAll()
    .executeTakeFirstOrThrow();
  return attemptFromRow(row);
}

/** The user's attempts in one session, oldest first by created_at, then by id. */
export async function selectAttemptsBySession(
  trx: DatabaseTransaction,
  userId: string,
  sessionId: string,
): Promise<StoredAttempt[]> {
  if (!isUuid(userId) || !isUuid(sessionId)) return [];
  const rows = await trx
    .selectFrom('attempts')
    .selectAll()
    .where('user_id', '=', userId)
    .where('session_id', '=', sessionId)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return rows.map(attemptFromRow);
}

/** The user's attempts, newest first by created_at, then by descending id. */
export async function selectAttemptsByUser(
  trx: DatabaseTransaction,
  userId: string,
  limit?: number,
): Promise<StoredAttempt[]> {
  if (!isUuid(userId)) return [];
  let query = trx
    .selectFrom('attempts')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc');
  if (limit !== undefined && limit !== Number.POSITIVE_INFINITY) {
    query = query.limit(Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0);
  }
  const rows = await query.execute();
  return rows.map(attemptFromRow);
}

// ---------- the adapter ----------

/** Runs `work` and gives a duplicate primary key the message the in memory store uses. */
async function namingDuplicates<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // 23505 unique_violation: the only unique constraint on both tables is the id.
    if (pgCode(error) === '23505') throw new Error(`${what} already exists`, { cause: error });
    throw error;
  }
}

/**
 * SessionStore on PostgreSQL. `db` is the handle from createDb. Each method
 * opens its own withUser transaction for the user id it is given.
 */
export function createPostgresSessionStore(db: Database): SessionStore {
  return {
    insertSession: (session) =>
      namingDuplicates(`lesson session ${session.id}`, () =>
        withUser(db, session.userId, (trx) => insertSessionRow(trx, session)),
      ),
    getSession: (userId, id) => withUser(db, userId, (trx) => selectSession(trx, userId, id)),
    updateSession: (userId, id, patch) =>
      withUser(db, userId, (trx) => patchSession(trx, userId, id, patch)),
    listSessionsByUser: (userId) =>
      withUser(db, userId, (trx) => selectSessionsByUser(trx, userId)),
    insertAttempt: (attempt) =>
      namingDuplicates(`attempt ${attempt.id}`, () =>
        withUser(db, attempt.userId, (trx) => insertAttemptRow(trx, attempt)),
      ),
    listAttemptsBySession: (userId, sessionId) =>
      withUser(db, userId, (trx) => selectAttemptsBySession(trx, userId, sessionId)),
    listAttemptsByUser: (userId, limit) =>
      withUser(db, userId, (trx) => selectAttemptsByUser(trx, userId, limit)),
    completedLessonIds: (userId) =>
      withUser(db, userId, (trx) => selectCompletedLessonIds(trx, userId)),
  };
}
