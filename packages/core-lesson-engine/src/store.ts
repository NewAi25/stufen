// Storage port for core-lesson-engine and its in memory adapter. The port lists
// the reads and writes this box needs from `lesson_sessions` and `attempts` in
// docs/03-data-schema.md. The Postgres adapter in postgres-store.ts implements
// the same interface.
//
// Every method acts for one user. A method that takes a session id takes the
// acting user id first and only ever sees that user's rows, the way row level
// security does it in Postgres. Another user's session reads as null.
import type { ExerciseTypeId, Feedback, LanguageCode, LessonSession } from '@stufen/contracts';

/** A lesson session as stored, plus the language of its lesson. */
export interface StoredSession extends LessonSession {
  /**
   * The in memory store keeps the value it is given. The Postgres store has no
   * column for it and reads it from the unit of the lesson.
   */
  language: LanguageCode;
}

/** The two fields that change when a session is completed. */
export interface SessionPatch {
  completedAt?: string | null;
  /** 0 to 1, at most three decimals (the column is numeric(4,3)). */
  score?: number | null;
}

/** One row of `attempts`. `sessionId` is null for a standalone attempt. */
export interface StoredAttempt {
  id: string;
  userId: string;
  sessionId: string | null;
  exerciseId: string | null;
  itemId: string | null;
  exerciseType: ExerciseTypeId;
  correct: boolean;
  /** 0 to 1, at most three decimals (the column is numeric(4,3)). */
  score: number;
  /** Any JSON value. Null when the caller gave none. */
  response: unknown;
  feedback: Feedback | null;
  durationMs: number | null;
  /** ISO timestamp, chosen by the caller. */
  createdAt: string;
}

/**
 * Thrown by insertAttempt when the session already holds an attempt for the
 * exercise. One answer per exercise and session.
 */
export class DuplicateAttemptError extends Error {
  readonly sessionId: string;
  readonly exerciseId: string;

  constructor(sessionId: string, exerciseId: string) {
    super(`Session ${sessionId} already has an attempt for exercise ${exerciseId}`);
    this.name = 'DuplicateAttemptError';
    this.sessionId = sessionId;
    this.exerciseId = exerciseId;
  }
}

export interface SessionStore {
  /** Adds one session for `session.userId` and resolves to it as stored. */
  insertSession(session: StoredSession): Promise<StoredSession>;
  /** The session, or null when the id is unknown or it belongs to another user. */
  getSession(userId: string, id: string): Promise<StoredSession | null>;
  /** Sets the given fields. Null when the user has no session with that id. */
  updateSession(userId: string, id: string, patch: SessionPatch): Promise<StoredSession | null>;
  /** The user's sessions, oldest first by `startedAt`, then by id. */
  listSessionsByUser(userId: string): Promise<StoredSession[]>;
  /**
   * Adds one attempt for `attempt.userId` and resolves to it as stored. Rejects
   * when `sessionId` is set and is not a session of that user. Rejects with
   * DuplicateAttemptError when `sessionId` and `exerciseId` are both set and
   * the session already has an attempt for that exercise.
   */
  insertAttempt(attempt: StoredAttempt): Promise<StoredAttempt>;
  /** The user's attempts in one session, oldest first by `createdAt`, then by id. */
  listAttemptsBySession(userId: string, sessionId: string): Promise<StoredAttempt[]>;
  /** The user's attempts, newest first by `createdAt`, then by descending id. */
  listAttemptsByUser(userId: string, limit?: number): Promise<StoredAttempt[]>;
  /** Distinct lesson ids of the user's completed sessions, in ascending order. */
  completedLessonIds(userId: string): Promise<string[]>;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byTime(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

/**
 * Keeps rows in arrays for unit tests and local runs. Rows are copied on the
 * way in and on the way out, so callers cannot change stored data by mutating
 * what they hold.
 */
export function createInMemorySessionStore(): SessionStore {
  const sessions: StoredSession[] = [];
  const attempts: StoredAttempt[] = [];

  function ownSession(userId: string, id: string): StoredSession | undefined {
    return sessions.find((row) => row.id === id && row.userId === userId);
  }

  return {
    async insertSession(session) {
      if (sessions.some((row) => row.id === session.id)) {
        throw new Error(`lesson session ${session.id} already exists`);
      }
      sessions.push(structuredClone(session));
      return structuredClone(session);
    },

    async getSession(userId, id) {
      const row = ownSession(userId, id);
      return row ? structuredClone(row) : null;
    },

    async updateSession(userId, id, patch) {
      const row = ownSession(userId, id);
      if (!row) return null;
      if (patch.completedAt !== undefined) row.completedAt = patch.completedAt;
      if (patch.score !== undefined) row.score = patch.score;
      return structuredClone(row);
    },

    async listSessionsByUser(userId) {
      return sessions
        .filter((row) => row.userId === userId)
        .sort((a, b) => byTime(a.startedAt, b.startedAt) || byText(a.id, b.id))
        .map((row) => structuredClone(row));
    },

    async insertAttempt(attempt) {
      if (attempts.some((row) => row.id === attempt.id)) {
        throw new Error(`attempt ${attempt.id} already exists`);
      }
      const { sessionId, exerciseId } = attempt;
      if (sessionId !== null && !ownSession(attempt.userId, sessionId)) {
        throw new Error(`user ${attempt.userId} has no lesson session ${sessionId}`);
      }
      if (sessionId !== null && exerciseId !== null) {
        const taken = attempts.some(
          (row) => row.sessionId === sessionId && row.exerciseId === exerciseId,
        );
        if (taken) throw new DuplicateAttemptError(sessionId, exerciseId);
      }
      attempts.push(structuredClone(attempt));
      return structuredClone(attempt);
    },

    async listAttemptsBySession(userId, sessionId) {
      return attempts
        .filter((row) => row.userId === userId && row.sessionId === sessionId)
        .sort((a, b) => byTime(a.createdAt, b.createdAt) || byText(a.id, b.id))
        .map((row) => structuredClone(row));
    },

    async listAttemptsByUser(userId, limit) {
      const own = attempts
        .filter((row) => row.userId === userId)
        .sort((a, b) => byTime(b.createdAt, a.createdAt) || byText(b.id, a.id))
        .map((row) => structuredClone(row));
      return limit === undefined ? own : own.slice(0, Math.max(0, Math.trunc(limit)));
    },

    async completedLessonIds(userId) {
      const ids = new Set<string>();
      for (const row of sessions) {
        if (row.userId === userId && row.completedAt !== null) ids.add(row.lessonId);
      }
      return [...ids].sort(byText);
    },
  };
}
