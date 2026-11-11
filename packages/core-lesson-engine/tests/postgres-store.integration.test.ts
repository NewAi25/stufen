// Integration test for the Postgres adapter. Needs a real PostgreSQL with the
// migrations applied and is skipped when DATABASE_URL is not set. See "How to
// test it" in the README.
//
//   DATABASE_URL=postgres://stufen@localhost:5432/stufen pnpm --filter @stufen/core-lesson-engine test
//
// As the owner it creates its own users (a row in `users`, then
// ensure_profile) and its own content: one unit in 'nl', two lessons and four
// exercises, with random ids and slugs. At the end it deletes exactly those
// rows. Deleting the users cascades to profiles, lesson_sessions and attempts;
// deleting the unit cascades to lessons and exercises.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { EventMap, Lesson } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import {
  createLessonEngine,
  createPostgresSessionStore,
  OutOfOrderError,
  SessionAccessError,
  SessionIncompleteError,
} from '../src/index';
import type { SessionStore, StoredAttempt } from '../src/index';
import {
  attemptToColumns,
  patchSession,
  selectAttemptsBySession,
  selectAttemptsByUser,
  selectSession,
  selectSessionsByUser,
} from '../src/postgres-store';
import { BOOM, createFakeGrader, HALF, makeLesson, PACK_VERSION, RIGHT, WRONG } from './fixtures';
import { runSessionStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('Postgres SessionStore on a real Postgres', () => {
  const createdUsers: string[] = [];
  const unitId = randomUUID();
  const secondLessonId = randomUUID();
  const lesson: Lesson = makeLesson({
    unitId,
    candoIds: [[randomUUID()], [], [], []],
    itemIds: [[], [randomUUID(), randomUUID()], [], []],
  });
  const exerciseIds = lesson.exercises.map((exercise) => exercise.id);
  let db: Database;
  let store: SessionStore;

  /** A user as core-auth leaves it after sign up: a `users` row and a profile. */
  async function newUser(): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p113-${id}@example.test` })
      .execute();
    await sql`select ensure_profile(${id}::uuid)`.execute(db);
    return id;
  }

  beforeAll(async () => {
    db = createDb(url as string);
    store = createPostgresSessionStore(db);
    await db
      .insertInto('units')
      .values({
        id: unitId,
        language_code: 'nl',
        level: 'A1',
        ordinal: 1,
        slug: `p113-unit-${unitId}`,
        title: 'Lesson engine test unit',
        pack_version: PACK_VERSION,
      })
      .execute();
    const lessonRow = { unit_id: unitId, title: 'Test lesson', pack_version: PACK_VERSION };
    await db
      .insertInto('lessons')
      .values([
        { ...lessonRow, id: lesson.id, ordinal: 1, slug: `p113-lesson-${lesson.id}` },
        { ...lessonRow, id: secondLessonId, ordinal: 2, slug: `p113-lesson-${secondLessonId}` },
      ])
      .execute();
    await db
      .insertInto('exercises')
      .values(
        lesson.exercises.map((exercise) => ({
          id: exercise.id,
          lesson_id: lesson.id,
          ordinal: exercise.ordinal,
          type: exercise.type,
          skill: exercise.skill,
          payload: JSON.stringify(exercise.payload),
          pack_version: PACK_VERSION,
        })),
      )
      .execute();
  });

  afterAll(async () => {
    // Users first: lesson_sessions.lesson_id has no cascade, so the sessions
    // must be gone before the lessons can be deleted.
    if (createdUsers.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    }
    await db.deleteFrom('units').where('id', '=', unitId).execute();
    await db.destroy();
  });

  runSessionStoreContract('Postgres', () => ({
    store,
    newUserId: newUser,
    language: 'nl',
    lessonId: lesson.id,
    exerciseIds,
    secondLessonId,
  }));

  const T1 = '2026-11-11T10:00:00.000Z';

  /** User A with one session and one attempt in it, and a standalone attempt. */
  async function seededA() {
    const a = await newUser();
    const session = await store.insertSession({
      id: randomUUID(),
      userId: a,
      lessonId: lesson.id,
      language: 'nl',
      startedAt: T1,
      completedAt: null,
      score: null,
      exerciseOrder: exerciseIds,
    });
    const base: StoredAttempt = {
      id: randomUUID(),
      userId: a,
      sessionId: session.id,
      exerciseId: exerciseIds[0] ?? null,
      itemId: null,
      exerciseType: 'multiple_choice',
      correct: true,
      score: 1,
      response: { selected: 1 },
      feedback: { message: 'Correct.' },
      durationMs: null,
      createdAt: T1,
    };
    const inSession = await store.insertAttempt(base);
    const standalone = await store.insertAttempt({
      ...base,
      id: randomUUID(),
      sessionId: null,
      exerciseId: null,
    });
    return { a, session, inSession, standalone };
  }

  /** The Postgres error code of a rejected promise, or 'no error'. */
  async function errorCodeOf(work: Promise<unknown>): Promise<string> {
    try {
      await work;
      return 'no error';
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        return String(error.code);
      }
      throw error;
    }
  }

  // The statements are run inside user B's transaction and pointed at user A,
  // so what is refused here is refused by the policies, not by a where clause.
  describe('row security: user B against user A', () => {
    it("B cannot read A's session, through the store or through the statements", async () => {
      const { a, session } = await seededA();
      const b = await newUser();

      expect(await store.getSession(b, session.id)).toBeNull();
      expect(await withUser(db, b, (trx) => selectSession(trx, a, session.id))).toBeNull();
      expect(await withUser(db, b, (trx) => selectSessionsByUser(trx, a))).toEqual([]);
      const raw = await withUser(db, b, (trx) =>
        trx.selectFrom('lesson_sessions').select('id').where('id', '=', session.id).execute(),
      );
      expect(raw).toEqual([]);
      expect(await store.getSession(a, session.id)).toEqual(session);
    });

    it("B cannot read A's attempts, through the store or through the statements", async () => {
      const { a, session, inSession, standalone } = await seededA();
      const b = await newUser();

      expect(await store.listAttemptsBySession(b, session.id)).toEqual([]);
      expect(await store.listAttemptsByUser(b)).toEqual([]);
      expect(await withUser(db, b, (trx) => selectAttemptsBySession(trx, a, session.id))).toEqual(
        [],
      );
      expect(await withUser(db, b, (trx) => selectAttemptsByUser(trx, a))).toEqual([]);
      const raw = await withUser(db, b, (trx) =>
        trx.selectFrom('attempts').select('id').where('user_id', '=', a).execute(),
      );
      expect(raw).toEqual([]);
      expect(await store.listAttemptsByUser(a)).toHaveLength(2);
      expect(await store.listAttemptsBySession(a, session.id)).toEqual([inSession]);
      expect((await store.listAttemptsByUser(a)).map((row) => row.id)).toContain(standalone.id);
    });

    it("B cannot change A's session", async () => {
      const { a, session } = await seededA();
      const b = await newUser();

      const viaStore = await store.updateSession(b, session.id, { completedAt: T1, score: 1 });
      const viaStatement = await withUser(db, b, (trx) =>
        patchSession(trx, a, session.id, { completedAt: T1, score: 1 }),
      );

      expect(viaStore).toBeNull();
      expect(viaStatement).toBeNull();
      expect(await store.getSession(a, session.id)).toEqual(session);
      expect(await store.completedLessonIds(a)).toEqual([]);
    });

    it("B cannot write a session or an attempt in A's name", async () => {
      const { a, session, inSession } = await seededA();
      const b = await newUser();

      // 42501 is insufficient_privilege: the insert policy refused the row.
      const forgedSession = await errorCodeOf(
        withUser(db, b, (trx) =>
          trx
            .insertInto('lesson_sessions')
            .values({ id: randomUUID(), user_id: a, lesson_id: lesson.id })
            .execute(),
        ),
      );
      const forgedAttempt = await errorCodeOf(
        withUser(db, b, (trx) =>
          trx
            .insertInto('attempts')
            .values(attemptToColumns({ ...inSession, id: randomUUID(), sessionId: null }))
            .execute(),
        ),
      );

      expect(forgedSession).toBe('42501');
      expect(forgedAttempt).toBe('42501');
      expect(await store.listSessionsByUser(a)).toEqual([session]);
      expect(await store.listAttemptsByUser(a)).toHaveLength(2);
    });

    it("B cannot attach an own attempt to A's session through the store", async () => {
      const { a, session, inSession } = await seededA();
      const b = await newUser();

      await expect(
        store.insertAttempt({
          ...inSession,
          id: randomUUID(),
          userId: b,
          exerciseId: exerciseIds[1] ?? null,
        }),
      ).rejects.toThrow(`user ${b} has no lesson session ${session.id}`);

      expect(await store.listAttemptsByUser(b)).toEqual([]);
      expect(await store.listAttemptsBySession(a, session.id)).toEqual([inSession]);
    });

    it('a transaction with nobody signed in sees no sessions and no attempts', async () => {
      const { a, session } = await seededA();

      const seen = await withUser(db, null, async (trx) => ({
        sessions: await trx
          .selectFrom('lesson_sessions')
          .select('id')
          .where('id', '=', session.id)
          .execute(),
        attempts: await trx.selectFrom('attempts').select('id').where('user_id', '=', a).execute(),
      }));

      expect(seen).toEqual({ sessions: [], attempts: [] });
    });
  });

  describe('what Postgres adds to the contract', () => {
    it('reads the language from the unit of the lesson, not from the caller', async () => {
      const userId = await newUser();

      const stored = await store.insertSession({
        id: randomUUID(),
        userId,
        lessonId: lesson.id,
        language: 'de',
        startedAt: T1,
        completedAt: null,
        score: null,
        exerciseOrder: exerciseIds,
      });

      expect(stored.language).toBe('nl');
      expect((await store.getSession(userId, stored.id))?.language).toBe('nl');
    });

    it('returns numeric scores as numbers', async () => {
      const { a, session, inSession } = await seededA();

      const updated = await store.updateSession(a, session.id, { completedAt: T1, score: 0.125 });

      expect(updated?.score).toBe(0.125);
      expect(typeof inSession.score).toBe('number');
    });

    it('treats ids that are not uuids as unknown on reads', async () => {
      const userId = await newUser();

      expect(await store.getSession(userId, 'not-a-uuid')).toBeNull();
      expect(await store.updateSession(userId, 'not-a-uuid', { score: 1 })).toBeNull();
      expect(await store.listAttemptsBySession(userId, 'not-a-uuid')).toEqual([]);
    });
  });

  describe('createLessonEngine on the Postgres store', () => {
    function engineOnPostgres() {
      const bus = createEventBus();
      const attemptEvents: EventMap['attempt.recorded'][] = [];
      const lessonEvents: EventMap['lesson.completed'][] = [];
      bus.on('attempt.recorded', async (payload) => {
        attemptEvents.push(payload);
      });
      bus.on('lesson.completed', async (payload) => {
        lessonEvents.push(payload);
      });
      const grader = createFakeGrader();
      const engine = createLessonEngine({
        store,
        bus,
        getLesson: async (lessonId) => (lessonId === lesson.id ? { lesson, language: 'nl' } : null),
        grade: grader.grade,
      });
      return { engine, grader, attemptEvents, lessonEvents };
    }
    const [e1, e2, e3, e4] = lesson.exercises;
    if (!e1 || !e2 || !e3 || !e4) throw new Error('the fixture lesson needs four exercises');

    it('runs a whole session: start, resume, answer in order, complete once', async () => {
      const userId = await newUser();
      const { engine, attemptEvents, lessonEvents } = engineOnPostgres();

      const session = await engine.startSession(userId, lesson.id);
      const resumed = await engine.startSession(userId, lesson.id);
      const first = await engine.currentExercise(userId, session.id);
      const r1 = await engine.submitAnswer(userId, session.id, e1.id, RIGHT, 1500);
      const early = await engine.completeSession(userId, session.id).catch((e: unknown) => e);
      const skipped = await engine
        .submitAnswer(userId, session.id, e3.id, RIGHT)
        .catch((e: unknown) => e);
      const repeated = await engine
        .submitAnswer(userId, session.id, e1.id, RIGHT)
        .catch((e: unknown) => e);
      await engine.submitAnswer(userId, session.id, e2.id, HALF);
      await engine.submitAnswer(userId, session.id, e3.id, WRONG);
      const r4 = await engine.submitAnswer(userId, session.id, e4.id, RIGHT);
      const result = await engine.completeSession(userId, session.id);
      const again = await engine.completeSession(userId, session.id);

      expect(session.exerciseOrder).toEqual(exerciseIds);
      expect(resumed).toEqual(session);
      expect(first).toEqual(e1);
      expect(r1).toEqual({
        grade: { correct: true, score: 1, feedback: { message: 'Correct.' } },
        next: e2,
      });
      expect(early).toBeInstanceOf(SessionIncompleteError);
      expect(skipped).toBeInstanceOf(OutOfOrderError);
      expect(repeated).toMatchObject({ name: 'OutOfOrderError', reason: 'already_answered' });
      expect(r4.next).toBeNull();
      expect(await engine.currentExercise(userId, session.id)).toBeNull();
      expect(result).toMatchObject({
        sessionId: session.id,
        lessonId: lesson.id,
        score: 0.625,
        attempts: 4,
        correct: 2,
      });
      expect(again).toEqual(result);
      expect(lessonEvents).toEqual([{ userId, lessonId: lesson.id, score: 0.625 }]);
      expect(await engine.completedLessonIds(userId)).toEqual([lesson.id]);

      const stored = await store.listAttemptsBySession(userId, session.id);
      expect(stored.map((row) => row.exerciseId).sort()).toEqual([...exerciseIds].sort());
      expect(stored.find((row) => row.exerciseId === e2.id)).toMatchObject({
        exerciseType: 'cloze',
        correct: false,
        score: 0.5,
        response: HALF,
        feedback: { message: 'Nearly.', expected: 'right' },
        durationMs: null,
      });
      expect(attemptEvents).toHaveLength(4);
      expect(attemptEvents[1]).toEqual({
        userId,
        attemptId: stored.find((row) => row.exerciseId === e2.id)?.id,
        exerciseType: 'cloze',
        correct: false,
        score: 0.5,
        candoIds: e2.candoIds,
        itemIds: e2.itemIds,
        language: 'nl',
      });
      expect((await store.getSession(userId, session.id))?.completedAt).toBe(result.completedAt);
    });

    it("refuses another user's session in every session method", async () => {
      const a = await newUser();
      const b = await newUser();
      const { engine, grader, attemptEvents } = engineOnPostgres();
      const session = await engine.startSession(a, lesson.id);

      const refused = await Promise.all([
        engine.currentExercise(b, session.id).catch((e: unknown) => e),
        engine.submitAnswer(b, session.id, e1.id, RIGHT).catch((e: unknown) => e),
        engine.completeSession(b, session.id).catch((e: unknown) => e),
      ]);

      for (const error of refused) expect(error).toBeInstanceOf(SessionAccessError);
      expect(grader.calls).toEqual([]);
      expect(attemptEvents).toEqual([]);
      expect(await store.listAttemptsByUser(b)).toEqual([]);
      expect(await store.listAttemptsBySession(a, session.id)).toEqual([]);
      // B starting the same lesson gets an own session, not A's.
      const own = await engine.startSession(b, lesson.id);
      expect(own.id).not.toBe(session.id);
      expect(own.userId).toBe(b);
    });

    it('stores nothing when the grader throws', async () => {
      const userId = await newUser();
      const { engine, attemptEvents } = engineOnPostgres();
      const session = await engine.startSession(userId, lesson.id);

      await expect(engine.submitAnswer(userId, session.id, e1.id, BOOM)).rejects.toThrow(
        'the fake grader was told to fail',
      );

      expect(await store.listAttemptsByUser(userId)).toEqual([]);
      expect(attemptEvents).toEqual([]);
      expect(await engine.currentExercise(userId, session.id)).toEqual(e1);
    });

    it('stores one attempt when two submits race for the same exercise', async () => {
      const userId = await newUser();
      const { engine, attemptEvents } = engineOnPostgres();
      const session = await engine.startSession(userId, lesson.id);

      const settled = await Promise.allSettled([
        engine.submitAnswer(userId, session.id, e1.id, RIGHT),
        engine.submitAnswer(userId, session.id, e1.id, WRONG),
      ]);

      const lost = settled.filter((entry) => entry.status === 'rejected');
      expect(lost).toHaveLength(1);
      expect(lost[0]?.reason).toBeInstanceOf(OutOfOrderError);
      expect(await store.listAttemptsBySession(userId, session.id)).toHaveLength(1);
      expect(attemptEvents).toHaveLength(1);
    });

    it('records a standalone attempt and emits attempt.recorded', async () => {
      const userId = await newUser();
      const { engine, attemptEvents } = engineOnPostgres();
      const candoId = randomUUID();

      await engine.recordStandaloneAttempt(userId, {
        language: 'nl',
        exerciseType: 'flashcard',
        exerciseId: e1.id,
        correct: true,
        score: 0.8,
        candoIds: [candoId],
        itemIds: [],
        response: { rating: 'good' },
        durationMs: 700,
      });

      const stored = await store.listAttemptsByUser(userId);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        userId,
        sessionId: null,
        exerciseId: e1.id,
        itemId: null,
        exerciseType: 'flashcard',
        correct: true,
        score: 0.8,
        response: { rating: 'good' },
        feedback: null,
        durationMs: 700,
      });
      expect(attemptEvents).toEqual([
        {
          userId,
          attemptId: stored[0]?.id,
          exerciseType: 'flashcard',
          correct: true,
          score: 0.8,
          candoIds: [candoId],
          itemIds: [],
          language: 'nl',
        },
      ]);
      expect(await engine.completedLessonIds(userId)).toEqual([]);
    });
  });
});
