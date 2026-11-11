// Unit tests for the lesson engine on the in memory store, with the real bus
// from @stufen/contracts. No database.
import { describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { EventMap, Exercise, GradeResult, Lesson, StandaloneAttempt } from '@stufen/contracts';
import {
  AttemptValidationError,
  createInMemorySessionStore,
  createLessonEngine,
  LessonNotFoundError,
  OutOfOrderError,
  SessionAccessError,
  SessionIncompleteError,
} from '../src/index';
import type { CreateLessonEngineOptions } from '../src/index';
import {
  BOOM,
  createFakeGrader,
  FakeGraderError,
  HALF,
  makeLesson,
  RIGHT,
  WRONG,
} from './fixtures';

const ADA = 'user-ada';
const BOB = 'user-bob';
const START = Date.UTC(2026, 10, 11, 9, 0, 0);

function setup(overrides: Partial<CreateLessonEngineOptions> = {}, lessonOverride?: Lesson) {
  const lesson =
    lessonOverride ??
    makeLesson({
      candoIds: [['cando-1'], ['cando-1', 'cando-2'], [], ['cando-3']],
      itemIds: [['item-1'], [], ['item-2', 'item-3'], []],
    });
  const store = createInMemorySessionStore();
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
  // Each reading of the clock is one second later, each id one higher.
  let tick = 0;
  let nextId = 0;
  const engine = createLessonEngine({
    store,
    bus,
    getLesson: async (lessonId) => (lessonId === lesson.id ? { lesson, language: 'de' } : null),
    grade: grader.grade,
    now: () => new Date(START + 1000 * tick++),
    newId: () => `id-${++nextId}`,
    ...overrides,
  });
  const [e1, e2, e3, e4] = lesson.exercises as [Exercise, Exercise, Exercise, Exercise];
  return { engine, store, bus, lesson, grader, attemptEvents, lessonEvents, e1, e2, e3, e4 };
}

/** Answers the first exercises of the session in order, one per response. */
async function answerAll(
  ctx: ReturnType<typeof setup>,
  userId: string,
  sessionId: string,
  responses: unknown[] = [RIGHT, RIGHT, RIGHT, RIGHT],
): Promise<void> {
  for (const [index, response] of responses.entries()) {
    const exercise = ctx.lesson.exercises[index];
    if (!exercise) throw new Error(`the fixture lesson has no exercise ${index + 1}`);
    await ctx.engine.submitAnswer(userId, sessionId, exercise.id, response);
  }
}

describe('startSession', () => {
  it('creates a session with the exercises in ordinal order', async () => {
    const ctx = setup();

    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    expect(session).toEqual({
      id: 'id-1',
      userId: ADA,
      lessonId: ctx.lesson.id,
      startedAt: '2026-11-11T09:00:00.000Z',
      completedAt: null,
      score: null,
      exerciseOrder: [ctx.e1.id, ctx.e2.id, ctx.e3.id, ctx.e4.id],
    });
    expect(await ctx.store.getSession(ADA, 'id-1')).toEqual({ ...session, language: 'de' });
  });

  it('orders by ordinal even when the lesson lists its exercises differently', async () => {
    const lesson = makeLesson();
    const ids = lesson.exercises.map((exercise) => exercise.id);
    lesson.exercises.reverse();
    const ctx = setup({}, lesson);

    const session = await ctx.engine.startSession(ADA, lesson.id);

    expect(session.exerciseOrder).toEqual(ids);
  });

  it('throws LessonNotFoundError for an unknown lesson and stores nothing', async () => {
    const ctx = setup();

    const error = await ctx.engine.startSession(ADA, 'no-such-lesson').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LessonNotFoundError);
    expect(error).toMatchObject({ name: 'LessonNotFoundError', lessonId: 'no-such-lesson' });
    expect(await ctx.store.listSessionsByUser(ADA)).toEqual([]);
  });

  it('resumes the unfinished session for the lesson instead of creating another', async () => {
    const ctx = setup();
    const first = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await ctx.engine.submitAnswer(ADA, first.id, ctx.e1.id, RIGHT);

    const again = await ctx.engine.startSession(ADA, ctx.lesson.id);

    expect(again).toEqual(first);
    expect(await ctx.store.listSessionsByUser(ADA)).toHaveLength(1);
    expect((await ctx.engine.currentExercise(ADA, again.id))?.id).toBe(ctx.e2.id);
  });

  it('starts a new session once the earlier one is completed', async () => {
    const ctx = setup();
    const first = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, first.id);
    await ctx.engine.completeSession(ADA, first.id);

    const second = await ctx.engine.startSession(ADA, ctx.lesson.id);

    expect(second.id).not.toBe(first.id);
    expect(second.completedAt).toBeNull();
    expect((await ctx.engine.currentExercise(ADA, second.id))?.id).toBe(ctx.e1.id);
  });

  it('gives each user an own session for the same lesson', async () => {
    const ctx = setup();

    const ada = await ctx.engine.startSession(ADA, ctx.lesson.id);
    const bob = await ctx.engine.startSession(BOB, ctx.lesson.id);

    expect(bob.id).not.toBe(ada.id);
    expect(bob.userId).toBe(BOB);
  });
});

describe('currentExercise', () => {
  it('walks through the exercises in order and ends with null', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    const seen: (string | null)[] = [];

    for (const exercise of ctx.lesson.exercises) {
      seen.push((await ctx.engine.currentExercise(ADA, session.id))?.id ?? null);
      await ctx.engine.submitAnswer(ADA, session.id, exercise.id, WRONG);
    }
    seen.push((await ctx.engine.currentExercise(ADA, session.id))?.id ?? null);

    expect(seen).toEqual([ctx.e1.id, ctx.e2.id, ctx.e3.id, ctx.e4.id, null]);
  });

  it('returns the whole exercise from the lesson', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    expect(await ctx.engine.currentExercise(ADA, session.id)).toEqual(ctx.e1);
  });

  it('skips an exercise the lesson no longer has', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    ctx.lesson.exercises.splice(0, 1);

    expect((await ctx.engine.currentExercise(ADA, session.id))?.id).toBe(ctx.e2.id);
  });
});

describe("another user's session", () => {
  it('is refused by every method that takes a session id', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const refused = await Promise.all([
      ctx.engine.currentExercise(BOB, session.id).catch((e: unknown) => e),
      ctx.engine.submitAnswer(BOB, session.id, ctx.e1.id, RIGHT).catch((e: unknown) => e),
      ctx.engine.completeSession(BOB, session.id).catch((e: unknown) => e),
    ]);

    for (const error of refused) {
      expect(error).toBeInstanceOf(SessionAccessError);
      expect(error).toMatchObject({ userId: BOB, sessionId: session.id });
    }
    expect(ctx.grader.calls).toEqual([]);
    expect(ctx.attemptEvents).toEqual([]);
    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toEqual([]);
    expect((await ctx.engine.currentExercise(ADA, session.id))?.id).toBe(ctx.e1.id);
  });

  it('an unknown session id is refused the same way', async () => {
    const ctx = setup();

    await expect(ctx.engine.currentExercise(ADA, 'no-such-session')).rejects.toBeInstanceOf(
      SessionAccessError,
    );
  });
});

describe('submitAnswer', () => {
  it('grades, stores the attempt with response and feedback, and returns the next exercise', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const result = await ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, HALF, 4200);

    const grade: GradeResult = {
      correct: false,
      score: 0.5,
      feedback: { message: 'Nearly.', expected: 'right' },
      errorTypes: ['spelling'],
    };
    expect(result).toEqual({ grade, next: ctx.e2 });
    expect(ctx.grader.calls).toEqual([{ exerciseId: ctx.e1.id, response: HALF, language: 'de' }]);
    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toEqual([
      {
        id: 'id-2',
        userId: ADA,
        sessionId: session.id,
        exerciseId: ctx.e1.id,
        itemId: null,
        exerciseType: 'multiple_choice',
        correct: false,
        score: 0.5,
        response: HALF,
        feedback: { message: 'Nearly.', expected: 'right' },
        durationMs: 4200,
        createdAt: '2026-11-11T09:00:01.000Z',
      },
    ]);
  });

  it('emits attempt.recorded with the exact payload for each answer', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    await ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, RIGHT);
    await ctx.engine.submitAnswer(ADA, session.id, ctx.e2.id, WRONG);

    expect(ctx.attemptEvents).toEqual([
      {
        userId: ADA,
        attemptId: 'id-2',
        exerciseType: 'multiple_choice',
        correct: true,
        score: 1,
        candoIds: ['cando-1'],
        itemIds: ['item-1'],
        language: 'de',
      },
      {
        userId: ADA,
        attemptId: 'id-3',
        exerciseType: 'cloze',
        correct: false,
        score: 0,
        candoIds: ['cando-1', 'cando-2'],
        itemIds: [],
        language: 'de',
      },
    ]);
    expect(ctx.lessonEvents).toEqual([]);
  });

  it('returns next null after the last exercise and stores no duration when none is given', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id, [RIGHT, RIGHT, RIGHT]);

    const last = await ctx.engine.submitAnswer(ADA, session.id, ctx.e4.id, RIGHT);

    expect(last.next).toBeNull();
    const stored = await ctx.store.listAttemptsBySession(ADA, session.id);
    expect(stored.map((attempt) => attempt.durationMs)).toEqual([null, null, null, null]);
  });

  it('refuses an exercise that is ahead of the current one', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, ctx.e3.id, RIGHT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OutOfOrderError);
    expect(error).toMatchObject({
      name: 'OutOfOrderError',
      reason: 'not_current',
      sessionId: session.id,
      exerciseId: ctx.e3.id,
      expectedExerciseId: ctx.e1.id,
    });
    expect(ctx.grader.calls).toEqual([]);
    expect(ctx.attemptEvents).toEqual([]);
    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toEqual([]);
  });

  it('refuses an exercise that was already answered', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, WRONG);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, ctx.e1.id, RIGHT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OutOfOrderError);
    expect(error).toMatchObject({ reason: 'already_answered', expectedExerciseId: ctx.e2.id });
    expect(ctx.grader.calls).toHaveLength(1);
    expect(ctx.attemptEvents).toHaveLength(1);
    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toHaveLength(1);
  });

  it('refuses an exercise that is not part of the session', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, 'exercise-from-elsewhere', RIGHT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OutOfOrderError);
    expect(error).toMatchObject({ reason: 'not_in_session', expectedExerciseId: ctx.e1.id });
    expect(ctx.grader.calls).toEqual([]);
  });

  it('refuses any answer once the session is completed', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id);
    await ctx.engine.completeSession(ADA, session.id);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, ctx.e4.id, RIGHT)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ reason: 'already_answered', expectedExerciseId: null });
    expect(ctx.attemptEvents).toHaveLength(4);
  });

  it('stores and emits nothing when the grader throws, and the exercise stays current', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    await expect(ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, BOOM)).rejects.toBeInstanceOf(
      FakeGraderError,
    );

    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toEqual([]);
    expect(await ctx.store.listAttemptsByUser(ADA)).toEqual([]);
    expect(ctx.attemptEvents).toEqual([]);
    expect((await ctx.engine.currentExercise(ADA, session.id))?.id).toBe(ctx.e1.id);
    // The learner can answer the same exercise again after the failure.
    const retry = await ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, RIGHT);
    expect(retry.grade.correct).toBe(true);
    expect(ctx.attemptEvents).toHaveLength(1);
  });

  it('stores one attempt when two submits race for the same exercise', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const settled = await Promise.allSettled([
      ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, RIGHT),
      ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, WRONG),
    ]);

    const lost = settled.filter((entry) => entry.status === 'rejected');
    expect(lost).toHaveLength(1);
    expect(lost[0]?.reason).toBeInstanceOf(OutOfOrderError);
    expect(lost[0]?.reason).toMatchObject({ reason: 'already_answered' });
    expect(await ctx.store.listAttemptsBySession(ADA, session.id)).toHaveLength(1);
    expect(ctx.attemptEvents).toHaveLength(1);
  });

  it('rounds the score to three decimals in the result, the store and the event', async () => {
    const ctx = setup({
      grade: async () => ({ correct: false, score: 2 / 3, feedback: { message: 'Partly.' } }),
    });
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const result = await ctx.engine.submitAnswer(ADA, session.id, ctx.e1.id, RIGHT);

    expect(result.grade.score).toBe(0.667);
    expect((await ctx.store.listAttemptsBySession(ADA, session.id))[0]?.score).toBe(0.667);
    expect(ctx.attemptEvents[0]?.score).toBe(0.667);
  });

  it('refuses a response that is not a JSON value before grading', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    for (const response of [cycle, () => 'x', 10n]) {
      const error = await ctx.engine
        .submitAnswer(ADA, session.id, ctx.e1.id, response)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AttemptValidationError);
      expect(error).toMatchObject({ field: 'response' });
    }
    expect(ctx.grader.calls).toEqual([]);
    expect(await ctx.store.listAttemptsByUser(ADA)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, 2 ** 31])('refuses durationMs %s', async (durationMs) => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, ctx.e1.id, RIGHT, durationMs)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AttemptValidationError);
    expect(error).toMatchObject({ field: 'durationMs' });
    expect(ctx.grader.calls).toEqual([]);
  });

  it.each([
    ['a score above 1', { correct: true, score: 1.2, feedback: { message: 'x' } }, 'score'],
    [
      'a score that is not a number',
      { correct: true, score: Number.NaN, feedback: { message: 'x' } },
      'score',
    ],
    ['no boolean correct', { correct: 'yes', score: 1, feedback: { message: 'x' } }, 'correct'],
    ['no feedback', { correct: true, score: 1 }, 'feedback'],
  ])('stores nothing when the grader returns %s', async (_label, bad, field) => {
    // The cast stands in for a grader that breaks its contract at run time.
    const ctx = setup({ grade: async () => bad as unknown as GradeResult });
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    const error = await ctx.engine
      .submitAnswer(ADA, session.id, ctx.e1.id, RIGHT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AttemptValidationError);
    expect(error).toMatchObject({ field });
    expect(await ctx.store.listAttemptsByUser(ADA)).toEqual([]);
    expect(ctx.attemptEvents).toEqual([]);
  });
});

describe('completeSession', () => {
  it('refuses while exercises are unanswered and names them', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id, [RIGHT, RIGHT]);

    const error = await ctx.engine.completeSession(ADA, session.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionIncompleteError);
    expect(error).toMatchObject({
      name: 'SessionIncompleteError',
      sessionId: session.id,
      remainingExerciseIds: [ctx.e3.id, ctx.e4.id],
    });
    expect(ctx.lessonEvents).toEqual([]);
    expect(await ctx.store.getSession(ADA, session.id)).toMatchObject({
      completedAt: null,
      score: null,
    });
  });

  it('sets completedAt and the mean score, and emits lesson.completed with the exact payload', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id, [RIGHT, HALF, WRONG, RIGHT]);

    const result = await ctx.engine.completeSession(ADA, session.id);

    // Clock: start at second 0, four attempts at seconds 1 to 4, completion at 5.
    expect(result).toEqual({
      sessionId: session.id,
      lessonId: ctx.lesson.id,
      score: 0.625,
      attempts: 4,
      correct: 2,
      completedAt: '2026-11-11T09:00:05.000Z',
    });
    expect(ctx.lessonEvents).toEqual([{ userId: ADA, lessonId: ctx.lesson.id, score: 0.625 }]);
    expect(await ctx.store.getSession(ADA, session.id)).toMatchObject({
      completedAt: '2026-11-11T09:00:05.000Z',
      score: 0.625,
    });
  });

  it('rounds the mean to three decimals', async () => {
    const lesson = makeLesson();
    lesson.exercises.splice(3, 1);
    const ctx = setup({}, lesson);
    const session = await ctx.engine.startSession(ADA, lesson.id);
    await answerAll(ctx, ADA, session.id, [RIGHT, RIGHT, WRONG]);

    const result = await ctx.engine.completeSession(ADA, session.id);

    expect(result.score).toBe(0.667);
    expect(ctx.lessonEvents).toEqual([{ userId: ADA, lessonId: lesson.id, score: 0.667 }]);
  });

  it('returns the same result when called again and emits nothing more', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id, [RIGHT, WRONG, RIGHT, RIGHT]);
    const first = await ctx.engine.completeSession(ADA, session.id);

    const second = await ctx.engine.completeSession(ADA, session.id);
    const third = await ctx.engine.completeSession(ADA, session.id);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(ctx.lessonEvents).toHaveLength(1);
  });

  it('still returns the result of a completed session when the lesson is gone', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id);
    const first = await ctx.engine.completeSession(ADA, session.id);
    const later = createLessonEngine({
      store: ctx.store,
      bus: ctx.bus,
      getLesson: async () => null,
      grade: ctx.grader.grade,
    });

    expect(await later.completeSession(ADA, session.id)).toEqual(first);
    await expect(later.currentExercise(ADA, session.id)).rejects.toBeInstanceOf(
      LessonNotFoundError,
    );
  });

  it('completes a lesson without exercises with score 0', async () => {
    const lesson = makeLesson();
    lesson.exercises.length = 0;
    const ctx = setup({}, lesson);
    const session = await ctx.engine.startSession(ADA, lesson.id);

    const result = await ctx.engine.completeSession(ADA, session.id);

    expect(result).toMatchObject({ score: 0, attempts: 0, correct: 0 });
    expect(ctx.lessonEvents).toEqual([{ userId: ADA, lessonId: lesson.id, score: 0 }]);
  });
});

describe('recordStandaloneAttempt', () => {
  const review: StandaloneAttempt = {
    language: 'nl',
    exerciseType: 'flashcard',
    itemId: 'item-9',
    correct: true,
    score: 1,
    candoIds: ['cando-7'],
    itemIds: ['item-9'],
    response: { rating: 'good' },
    feedback: { message: 'Good.' },
    durationMs: 900,
  };

  it('stores an attempt with no session and emits attempt.recorded with the exact payload', async () => {
    const ctx = setup();

    const returned = await ctx.engine.recordStandaloneAttempt(ADA, review);

    expect(returned).toBeUndefined();
    expect(await ctx.store.listAttemptsByUser(ADA)).toEqual([
      {
        id: 'id-1',
        userId: ADA,
        sessionId: null,
        exerciseId: null,
        itemId: 'item-9',
        exerciseType: 'flashcard',
        correct: true,
        score: 1,
        response: { rating: 'good' },
        feedback: { message: 'Good.' },
        durationMs: 900,
        createdAt: '2026-11-11T09:00:00.000Z',
      },
    ]);
    expect(ctx.attemptEvents).toEqual([
      {
        userId: ADA,
        attemptId: 'id-1',
        exerciseType: 'flashcard',
        correct: true,
        score: 1,
        candoIds: ['cando-7'],
        itemIds: ['item-9'],
        language: 'nl',
      },
    ]);
    expect(ctx.grader.calls).toEqual([]);
  });

  it('stores nulls for the optional fields that are left out', async () => {
    const ctx = setup();

    await ctx.engine.recordStandaloneAttempt(ADA, {
      language: 'fr',
      exerciseType: 'write_free',
      correct: false,
      score: 0.4567,
      candoIds: [],
      itemIds: [],
    });

    expect(await ctx.store.listAttemptsByUser(ADA)).toMatchObject([
      {
        sessionId: null,
        exerciseId: null,
        itemId: null,
        score: 0.457,
        response: null,
        feedback: null,
        durationMs: null,
      },
    ]);
    expect(ctx.attemptEvents[0]).toMatchObject({ score: 0.457, language: 'fr' });
  });

  it('may repeat the same exercise any number of times', async () => {
    const ctx = setup();
    const again = { ...review, exerciseId: ctx.e1.id };

    await ctx.engine.recordStandaloneAttempt(ADA, again);
    await ctx.engine.recordStandaloneAttempt(ADA, again);

    expect(await ctx.store.listAttemptsByUser(ADA)).toHaveLength(2);
    expect(ctx.attemptEvents).toHaveLength(2);
  });

  it('does not count towards a session', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);

    await ctx.engine.recordStandaloneAttempt(ADA, { ...review, exerciseId: ctx.e1.id });

    expect((await ctx.engine.currentExercise(ADA, session.id))?.id).toBe(ctx.e1.id);
  });

  it.each([
    ['a score above 1', { score: 1.01 }, 'score'],
    ['a score below 0', { score: -0.1 }, 'score'],
    ['a score that is not a number', { score: '1' }, 'score'],
    ['a score that is not finite', { score: Number.POSITIVE_INFINITY }, 'score'],
    ['an unknown exercise type', { exerciseType: 'crossword' }, 'exerciseType'],
    ['no exercise type', { exerciseType: undefined }, 'exerciseType'],
    ['an unknown language', { language: 'es' }, 'language'],
    ['no language', { language: undefined }, 'language'],
    ['a correct that is not a boolean', { correct: 1 }, 'correct'],
    ['candoIds that is not a list of strings', { candoIds: [1] }, 'candoIds'],
    ['no itemIds', { itemIds: undefined }, 'itemIds'],
    ['an empty exerciseId', { exerciseId: '' }, 'exerciseId'],
    ['an itemId that is not a string', { itemId: 7 }, 'itemId'],
    ['a negative duration', { durationMs: -5 }, 'durationMs'],
    ['feedback without a message', { feedback: { expected: 'x' } }, 'feedback'],
    ['a response that is not JSON', { response: 5n }, 'response'],
  ])('refuses %s and stores nothing', async (_label, change, field) => {
    const ctx = setup();
    // The cast stands in for a caller that breaks the type at run time.
    const input = { ...review, ...change } as unknown as StandaloneAttempt;

    const error = await ctx.engine.recordStandaloneAttempt(ADA, input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AttemptValidationError);
    expect(error).toMatchObject({ name: 'AttemptValidationError', field });
    expect(await ctx.store.listAttemptsByUser(ADA)).toEqual([]);
    expect(ctx.attemptEvents).toEqual([]);
  });

  it('refuses an empty user id', async () => {
    const ctx = setup();

    await expect(ctx.engine.recordStandaloneAttempt('', review)).rejects.toMatchObject({
      field: 'userId',
    });
  });

  it('accepts the boundary scores 0 and 1', async () => {
    const ctx = setup();

    await ctx.engine.recordStandaloneAttempt(ADA, { ...review, score: 0, correct: false });
    await ctx.engine.recordStandaloneAttempt(ADA, { ...review, score: 1 });

    expect(ctx.attemptEvents.map((event) => event.score)).toEqual([0, 1]);
  });
});

describe('completedLessonIds', () => {
  it('lists a lesson once it is completed, and only for that user', async () => {
    const ctx = setup();
    const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
    await ctx.engine.startSession(BOB, ctx.lesson.id);
    await answerAll(ctx, ADA, session.id);

    expect(await ctx.engine.completedLessonIds(ADA)).toEqual([]);
    await ctx.engine.completeSession(ADA, session.id);

    expect(await ctx.engine.completedLessonIds(ADA)).toEqual([ctx.lesson.id]);
    expect(await ctx.engine.completedLessonIds(BOB)).toEqual([]);
  });

  it('lists a lesson once even after it was completed twice', async () => {
    const ctx = setup();
    for (let round = 0; round < 2; round++) {
      const session = await ctx.engine.startSession(ADA, ctx.lesson.id);
      await answerAll(ctx, ADA, session.id);
      await ctx.engine.completeSession(ADA, session.id);
    }

    expect(await ctx.store.listSessionsByUser(ADA)).toHaveLength(2);
    expect(await ctx.engine.completedLessonIds(ADA)).toEqual([ctx.lesson.id]);
  });
});

describe('defaults', () => {
  it('uses the system clock and random uuids when none are injected', async () => {
    const lesson = makeLesson();
    const engine = createLessonEngine({
      store: createInMemorySessionStore(),
      bus: createEventBus(),
      getLesson: async () => ({ lesson, language: 'de' }),
      grade: createFakeGrader().grade,
    });
    const before = Date.now();

    const session = await engine.startSession(ADA, lesson.id);

    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(Date.parse(session.startedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(session.startedAt)).toBeLessThanOrEqual(Date.now());
  });
});
