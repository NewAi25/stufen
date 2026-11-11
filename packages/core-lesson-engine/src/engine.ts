// The lesson engine: runs a session through the exercises of one lesson,
// grades each answer through the injected grader, stores the attempt and
// emits `attempt.recorded` and `lesson.completed`. Built by a factory so the
// store, the bus, the lesson source, the grader, the clock and the id source
// are all injected. No module level state.
import { EXERCISE_TYPES, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  EventBus,
  Exercise,
  ExerciseTypeId,
  Feedback,
  GradeResult,
  LanguageCode,
  Lesson,
  LessonSession,
  SessionResult,
  StandaloneAttempt,
} from '@stufen/contracts';
import {
  AttemptValidationError,
  LessonNotFoundError,
  OutOfOrderError,
  SessionAccessError,
  SessionIncompleteError,
} from './errors';
import type { AttemptField } from './errors';
import { DuplicateAttemptError } from './store';
import type { SessionStore, StoredAttempt, StoredSession } from './store';

/** What `getLesson` resolves to: the lesson and the language of its unit. */
export interface LessonWithLanguage {
  lesson: Lesson;
  language: LanguageCode;
}

export interface CreateLessonEngineOptions {
  store: SessionStore;
  bus: EventBus;
  /** From core-curriculum. Null when no lesson has this id. */
  getLesson: (lessonId: string) => Promise<LessonWithLanguage | null>;
  /** From core-exercise-types. May throw; then nothing is stored. */
  grade: (exercise: Exercise, response: unknown, language: LanguageCode) => Promise<GradeResult>;
  /** Clock for `startedAt`, `completedAt` and attempt times. Default: the system clock. */
  now?: () => Date;
  /** Id source for sessions and attempts. Default: `crypto.randomUUID()`. */
  newId?: () => string;
}

export interface SubmitAnswerResult {
  /** The grader's result, with the score rounded to three decimals as stored. */
  grade: GradeResult;
  /** The exercise to show next, or null when the session has no more. */
  next: Exercise | null;
}

export interface LessonEngine {
  /** Resumes the user's unfinished session for the lesson, or starts a new one. */
  startSession(userId: string, lessonId: string): Promise<LessonSession>;
  /** The first exercise of the session without an attempt, or null when all are answered. */
  currentExercise(userId: string, sessionId: string): Promise<Exercise | null>;
  /** Grades and stores one answer to the current exercise, then emits `attempt.recorded`. */
  submitAnswer(
    userId: string,
    sessionId: string,
    exerciseId: string,
    response: unknown,
    durationMs?: number,
  ): Promise<SubmitAnswerResult>;
  /** Closes a fully answered session and emits `lesson.completed` once. */
  completeSession(userId: string, sessionId: string): Promise<SessionResult>;
  /** Stores an attempt that has no session and emits `attempt.recorded`. */
  recordStandaloneAttempt(userId: string, input: StandaloneAttempt): Promise<void>;
  /** Distinct lesson ids of the user's completed sessions, in ascending order. */
  completedLessonIds(userId: string): Promise<string[]>;
}

// ---------- small helpers ----------

/** Scores are stored as numeric(4,3), so three decimals is all that survives. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isExerciseType(value: unknown): value is ExerciseTypeId {
  return EXERCISE_TYPES.some((type) => type === value);
}

function isLanguage(value: unknown): value is LanguageCode {
  return LANGUAGE_CODES.some((code) => code === value);
}

function fail(field: AttemptField, message: string): never {
  throw new AttemptValidationError(field, message);
}

/**
 * The response as the JSON value that is stored. Undefined becomes null.
 * Something JSON cannot carry (a function, a cycle, a bigint) is refused.
 */
function toStoredJson(response: unknown): unknown {
  if (response === undefined || response === null) return null;
  let text: string | undefined;
  try {
    text = JSON.stringify(response);
  } catch {
    text = undefined;
  }
  if (text === undefined) return fail('response', 'response must be a JSON value');
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

function checkedDuration(durationMs: unknown): number | null {
  if (durationMs === undefined || durationMs === null) return null;
  if (typeof durationMs !== 'number' || !Number.isInteger(durationMs) || durationMs < 0) {
    return fail('durationMs', 'durationMs must be a whole number of milliseconds, 0 or more');
  }
  // The column is a 32 bit integer.
  if (durationMs > 2_147_483_647) return fail('durationMs', 'durationMs is too large');
  return durationMs;
}

function checkedFeedback(feedback: unknown): Feedback | null {
  if (feedback === undefined || feedback === null) return null;
  if (!isRecord(feedback) || typeof feedback.message !== 'string') {
    return fail('feedback', 'feedback must be an object with a message string');
  }
  const stored = toStoredJson(feedback);
  if (!isRecord(stored) || typeof stored.message !== 'string') {
    return fail('feedback', 'feedback must be an object with a message string');
  }
  return { ...stored, message: stored.message };
}

/** Refuses a grade result that breaks the GradeResult contract. */
function checkedGrade(result: GradeResult): { grade: GradeResult; feedback: Feedback } {
  const value: unknown = result;
  if (!isRecord(value)) return fail('score', 'the grader returned no result');
  if (typeof value.correct !== 'boolean') {
    return fail('correct', 'the grader returned a result without a boolean `correct`');
  }
  if (!isScore(value.score)) {
    return fail('score', 'the grader returned a score that is not a number from 0 to 1');
  }
  const feedback = checkedFeedback(value.feedback);
  if (feedback === null) return fail('feedback', 'the grader returned a result without feedback');
  return { grade: { ...result, score: round3(value.score) }, feedback };
}

function optionalId(field: 'exerciseId' | 'itemId', value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value === '') {
    return fail(field, `${field} must be a non empty string when given`);
  }
  return value;
}

/** The contracts shape of a stored session: everything but the language. */
function toLessonSession(session: StoredSession): LessonSession {
  return {
    id: session.id,
    userId: session.userId,
    lessonId: session.lessonId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    score: session.score,
    exerciseOrder: [...session.exerciseOrder],
  };
}

// ---------- the engine ----------

/** Where a session stands: what is answered and what is still open. */
interface Progress {
  session: StoredSession;
  language: LanguageCode;
  exercises: Map<string, Exercise>;
  attempts: StoredAttempt[];
  answered: Set<string>;
  /** Unanswered exercise ids in session order. Ids the lesson no longer has are left out. */
  remaining: string[];
}

export function createLessonEngine(options: CreateLessonEngineOptions): LessonEngine {
  const { store, bus, getLesson, grade } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => crypto.randomUUID());

  async function requireLesson(lessonId: string): Promise<LessonWithLanguage> {
    const found = await getLesson(lessonId);
    if (!found) throw new LessonNotFoundError(lessonId);
    return found;
  }

  async function requireSession(userId: string, sessionId: string): Promise<StoredSession> {
    const session = await store.getSession(userId, sessionId);
    // The second check is for a store that hands out a foreign row anyway.
    if (!session || session.userId !== userId) throw new SessionAccessError(userId, sessionId);
    return session;
  }

  async function progressOf(userId: string, sessionId: string): Promise<Progress> {
    const session = await requireSession(userId, sessionId);
    const { lesson, language } = await requireLesson(session.lessonId);
    const attempts = await store.listAttemptsBySession(userId, sessionId);
    const exercises = new Map(lesson.exercises.map((exercise) => [exercise.id, exercise]));
    const answered = new Set<string>();
    for (const attempt of attempts) {
      if (attempt.exerciseId !== null) answered.add(attempt.exerciseId);
    }
    const remaining = session.exerciseOrder.filter((id) => exercises.has(id) && !answered.has(id));
    return { session, language, exercises, attempts, answered, remaining };
  }

  function resultOf(session: StoredSession, attempts: StoredAttempt[]): SessionResult {
    if (session.completedAt === null || session.score === null) {
      throw new Error(`lesson session ${session.id} is not completed`);
    }
    return {
      sessionId: session.id,
      lessonId: session.lessonId,
      score: session.score,
      attempts: attempts.length,
      correct: attempts.filter((attempt) => attempt.correct).length,
      completedAt: session.completedAt,
    };
  }

  return {
    async startSession(userId, lessonId) {
      const { lesson, language } = await requireLesson(lessonId);
      const mine = await store.listSessionsByUser(userId);
      // Oldest first, so of several unfinished sessions the first started wins.
      const open = mine.find((row) => row.lessonId === lessonId && row.completedAt === null);
      if (open) return toLessonSession(open);

      const inOrder = [...lesson.exercises].sort((a, b) => a.ordinal - b.ordinal);
      const stored = await store.insertSession({
        id: newId(),
        userId,
        lessonId,
        language,
        startedAt: now().toISOString(),
        completedAt: null,
        score: null,
        exerciseOrder: inOrder.map((exercise) => exercise.id),
      });
      return toLessonSession(stored);
    },

    async currentExercise(userId, sessionId) {
      const { exercises, remaining } = await progressOf(userId, sessionId);
      const currentId = remaining[0];
      return currentId === undefined ? null : (exercises.get(currentId) ?? null);
    },

    async submitAnswer(userId, sessionId, exerciseId, response, durationMs) {
      const { session, language, exercises, answered, remaining } = await progressOf(
        userId,
        sessionId,
      );
      const currentId = remaining[0] ?? null;
      const refuse = (reason: 'not_in_session' | 'already_answered' | 'not_current') =>
        new OutOfOrderError(sessionId, exerciseId, reason, currentId);
      if (!session.exerciseOrder.includes(exerciseId)) throw refuse('not_in_session');
      if (answered.has(exerciseId)) throw refuse('already_answered');
      const exercise = exercises.get(exerciseId);
      if (exerciseId !== currentId || !exercise) throw refuse('not_current');

      const storedResponse = toStoredJson(response);
      const duration = checkedDuration(durationMs);
      // A grader that throws ends the call here: nothing is stored or emitted.
      const checked = checkedGrade(await grade(exercise, response, language));

      const attemptId = newId();
      try {
        await store.insertAttempt({
          id: attemptId,
          userId,
          sessionId,
          exerciseId,
          itemId: null,
          exerciseType: exercise.type,
          correct: checked.grade.correct,
          score: checked.grade.score,
          response: storedResponse,
          feedback: checked.feedback,
          durationMs: duration,
          createdAt: now().toISOString(),
        });
      } catch (error) {
        // Two submits raced for the same exercise and the other one won.
        if (error instanceof DuplicateAttemptError) throw refuse('already_answered');
        throw error;
      }
      await bus.emit('attempt.recorded', {
        userId,
        attemptId,
        exerciseType: exercise.type,
        correct: checked.grade.correct,
        score: checked.grade.score,
        candoIds: [...exercise.candoIds],
        itemIds: [...exercise.itemIds],
        language,
      });
      const nextId = remaining[1];
      const next = nextId === undefined ? null : (exercises.get(nextId) ?? null);
      return { grade: checked.grade, next };
    },

    async completeSession(userId, sessionId) {
      const first = await requireSession(userId, sessionId);
      if (first.completedAt !== null) {
        // Already closed: the stored result again, and no second event.
        return resultOf(first, await store.listAttemptsBySession(userId, sessionId));
      }
      const { session, attempts, remaining } = await progressOf(userId, sessionId);
      if (remaining.length > 0) throw new SessionIncompleteError(sessionId, remaining);

      const total = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
      // A lesson without exercises has nothing to average and scores 0.
      const score = attempts.length === 0 ? 0 : round3(total / attempts.length);
      const updated = await store.updateSession(userId, sessionId, {
        completedAt: now().toISOString(),
        score,
      });
      if (!updated) throw new SessionAccessError(userId, sessionId);
      await bus.emit('lesson.completed', { userId, lessonId: session.lessonId, score });
      return resultOf(updated, attempts);
    },

    async recordStandaloneAttempt(userId, input) {
      // Checked as unknown on purpose: the callers are other boxes, and the
      // TypeScript types are a promise, not a guarantee.
      if (typeof userId !== 'string' || userId === '') {
        fail('userId', 'userId must be a non empty string');
      }
      const raw: unknown = input;
      if (!isRecord(raw)) return fail('exerciseType', 'the attempt must be an object');
      const { language, exerciseType, correct, score, candoIds, itemIds } = raw;
      if (!isLanguage(language)) {
        return fail('language', `language must be one of ${LANGUAGE_CODES.join(', ')}`);
      }
      if (!isExerciseType(exerciseType)) {
        return fail('exerciseType', `exerciseType must be one of ${EXERCISE_TYPES.join(', ')}`);
      }
      if (typeof correct !== 'boolean') return fail('correct', 'correct must be a boolean');
      if (!isScore(score)) return fail('score', 'score must be a number from 0 to 1');
      if (!isStringArray(candoIds)) return fail('candoIds', 'candoIds must be an array of strings');
      if (!isStringArray(itemIds)) return fail('itemIds', 'itemIds must be an array of strings');
      const exerciseId = optionalId('exerciseId', raw.exerciseId);
      const itemId = optionalId('itemId', raw.itemId);
      const response = toStoredJson(raw.response);
      const feedback = checkedFeedback(raw.feedback);
      const durationMs = checkedDuration(raw.durationMs);

      const attemptId = newId();
      const stored = round3(score);
      await store.insertAttempt({
        id: attemptId,
        userId,
        sessionId: null,
        exerciseId,
        itemId,
        exerciseType,
        correct,
        score: stored,
        response,
        feedback,
        durationMs,
        createdAt: now().toISOString(),
      });
      await bus.emit('attempt.recorded', {
        userId,
        attemptId,
        exerciseType,
        correct,
        score: stored,
        candoIds: [...candoIds],
        itemIds: [...itemIds],
        language,
      });
    },

    completedLessonIds: (userId) => store.completedLessonIds(userId),
  };
}
