// Behaviour of the progress service (P1-16 and P1-17) with the real in
// process bus from contracts. Everything runs in memory: no network, no
// filesystem, no account. The descriptor list is a small fixture passed in the
// way the composition root passes core-curriculum.
import { describe, expect, it, vi } from 'vitest';
import { CEFR_LEVELS, createEventBus } from '@stufen/contracts';
import type { Cando, CefrLevel, EventHandler, ExerciseTypeId, Skill } from '@stufen/contracts';
import { ProgressValidationError, createInMemoryMasteryStore, createProgress } from '../src/index';

const START = Date.parse('2026-11-06T10:00:00.000Z');
const DAY = 86_400_000;
const USER = 'user-1';

function cando(id: string, level: CefrLevel, skill: Skill, extra: Partial<Cando> = {}): Cando {
  return {
    id,
    languageCode: 'de',
    level,
    skill,
    code: `${level}.${id}`,
    textEn: `Can do ${id}`,
    textNative: null,
    source: 'cefr-cv-2020',
    masteryRule: null,
    ...extra,
  };
}

// A1 has five descriptors, three receptive or scaffolding and two production.
const CANDOS: Cando[] = [
  cando('a1-rea', 'A1', 'reading'),
  cando('a1-lis', 'A1', 'listening'),
  cando('a1-gra', 'A1', 'grammar'),
  cando('a1-wri', 'A1', 'writing'),
  cando('a1-spi', 'A1', 'spoken_interaction'),
  cando('a2-rea', 'A2', 'reading'),
];

/** One service wired to a fresh store and bus, with a clock the test controls. */
function setup(candos: Cando[] = CANDOS) {
  const store = createInMemoryMasteryStore();
  const bus = createEventBus();
  const mastered = vi.fn<EventHandler<'cando.mastered'>>(async () => {});
  const reached = vi.fn<EventHandler<'level.reached'>>(async () => {});
  bus.on('cando.mastered', mastered);
  bus.on('level.reached', reached);
  const errors: unknown[] = [];
  let time = START;
  let attemptNo = 0;

  const progress = createProgress({
    store,
    bus,
    listCandos: async (language, level) =>
      candos.filter(
        (c) =>
          (c.languageCode === null || c.languageCode === language) &&
          (level === undefined || c.level === level),
      ),
    now: () => new Date(time),
    onError: (error) => errors.push(error),
  });
  progress.attach();

  /** Emits one `attempt.recorded` for the user, the way core-exercises does. */
  async function attempt(
    candoIds: string | string[],
    exerciseType: ExerciseTypeId = 'cloze',
    correct = true,
  ): Promise<void> {
    await bus.emit('attempt.recorded', {
      userId: USER,
      attemptId: `attempt-${++attemptNo}`,
      exerciseType,
      correct,
      score: correct ? 1 : 0,
      candoIds: typeof candoIds === 'string' ? [candoIds] : candoIds,
      itemIds: [],
      language: 'de',
    });
  }

  /** Six correct attempts in two exercise types: enough for a receptive descriptor. */
  async function sixCorrect(candoId: string): Promise<void> {
    for (let i = 0; i < 3; i++) await attempt(candoId, 'cloze');
    for (let i = 0; i < 3; i++) await attempt(candoId, 'multiple_choice');
  }

  return {
    store,
    bus,
    progress,
    mastered,
    reached,
    errors,
    attempt,
    sixCorrect,
    /** Moves the injected clock forward. */
    advance(ms: number) {
      time += ms;
    },
  };
}

describe('mastery from attempt.recorded', () => {
  it('acceptance: six correct attempts in two types master a receptive descriptor and emit once', async () => {
    const { store, mastered, sixCorrect, attempt, errors } = setup();

    await sixCorrect('a1-rea');

    expect(await store.getMastery(USER, 'a1-rea')).toEqual({
      userId: USER,
      candoId: 'a1-rea',
      evidenceCount: 6,
      correctCount: 6,
      exerciseTypesSeen: ['cloze', 'multiple_choice'],
      bestProductionScore: null,
      recentAccuracy: 1,
      masteredAt: '2026-11-06T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    });
    expect(mastered).toHaveBeenCalledTimes(1);
    expect(mastered).toHaveBeenCalledWith({ userId: USER, candoId: 'a1-rea', level: 'A1' });

    // More attempts keep counting but never emit a second time.
    await attempt('a1-rea');
    await attempt('a1-rea', 'dictation');
    expect((await store.getMastery(USER, 'a1-rea'))?.evidenceCount).toBe(8);
    expect(mastered).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it('is not mastered after five attempts, or with one exercise type only', async () => {
    const { store, mastered, attempt } = setup();

    for (let i = 0; i < 5; i++) await attempt('a1-rea', i % 2 ? 'cloze' : 'dictation');
    expect((await store.getMastery(USER, 'a1-rea'))?.masteredAt).toBeNull();

    for (let i = 0; i < 8; i++) await attempt('a1-lis', 'listen_answer');
    expect((await store.getMastery(USER, 'a1-lis'))?.masteredAt).toBeNull();
    expect(mastered).not.toHaveBeenCalled();
  });

  it('lists an exercise type only once an attempt of that type is correct', async () => {
    const { store, mastered, attempt } = setup();

    for (let i = 0; i < 5; i++) await attempt('a1-rea', 'cloze');
    await attempt('a1-rea', 'dictation', false);
    await attempt('a1-rea', 'dictation', false);

    // Seven attempts, five correct, but correct in one type only.
    expect(await store.getMastery(USER, 'a1-rea')).toMatchObject({
      evidenceCount: 7,
      correctCount: 5,
      exerciseTypesSeen: ['cloze'],
      masteredAt: null,
    });
    expect(mastered).not.toHaveBeenCalled();
  });

  it('waits until accuracy over the last ten attempts is back at 0.8', async () => {
    const { store, mastered, attempt } = setup();

    for (let i = 0; i < 3; i++) await attempt('a1-rea', 'cloze', false);
    for (let i = 0; i < 4; i++) await attempt('a1-rea', 'cloze');
    for (let i = 0; i < 3; i++) await attempt('a1-rea', 'dictation');
    // Ten attempts, seven correct: 0.7.
    expect(await store.getMastery(USER, 'a1-rea')).toMatchObject({
      recentAccuracy: 0.7,
      masteredAt: null,
    });

    // Each further correct attempt pushes one early mistake out of the window.
    await attempt('a1-rea');
    expect(await store.getMastery(USER, 'a1-rea')).toMatchObject({ recentAccuracy: 0.8 });
    expect(mastered).toHaveBeenCalledTimes(1);
  });

  it('stays mastered when later attempts go wrong', async () => {
    const { store, mastered, sixCorrect, attempt } = setup();
    await sixCorrect('a1-rea');
    for (let i = 0; i < 6; i++) await attempt('a1-rea', 'cloze', false);

    const row = await store.getMastery(USER, 'a1-rea');
    expect(row?.recentAccuracy).toBe(0.4);
    expect(row?.masteredAt).toBe('2026-11-06T10:00:00.000Z');
    expect(mastered).toHaveBeenCalledTimes(1);
  });

  it('credits every descriptor of one event, and a repeated id once', async () => {
    const { store, mastered, attempt } = setup();

    for (let i = 0; i < 3; i++) await attempt(['a1-rea', 'a1-gra', 'a1-rea'], 'cloze');
    for (let i = 0; i < 3; i++) await attempt(['a1-rea', 'a1-gra'], 'translate');

    expect((await store.getMastery(USER, 'a1-rea'))?.evidenceCount).toBe(6);
    expect((await store.getMastery(USER, 'a1-gra'))?.evidenceCount).toBe(6);
    expect(mastered).toHaveBeenCalledTimes(2);
  });

  it('emits once when the attempts arrive at the same time', async () => {
    const { store, mastered, attempt } = setup();

    await Promise.all(
      Array.from({ length: 12 }, (_, i) => attempt('a1-rea', i % 2 ? 'cloze' : 'dictation')),
    );

    expect((await store.getMastery(USER, 'a1-rea'))?.evidenceCount).toBe(12);
    expect(mastered).toHaveBeenCalledTimes(1);
  });

  it('keeps the two users apart', async () => {
    const { store, bus, sixCorrect } = setup();
    await sixCorrect('a1-rea');
    await bus.emit('attempt.recorded', {
      userId: 'user-2',
      attemptId: 'other-1',
      exerciseType: 'cloze',
      correct: true,
      score: 1,
      candoIds: ['a1-rea'],
      itemIds: [],
      language: 'de',
    });

    expect((await store.getMastery('user-2', 'a1-rea'))?.evidenceCount).toBe(1);
    expect((await store.getMastery(USER, 'a1-rea'))?.evidenceCount).toBe(6);
  });
});

describe('failures inside the bus handler', () => {
  it('keeps the evidence for an unknown descriptor and reports it', async () => {
    const { store, mastered, sixCorrect, errors } = setup();

    await sixCorrect('not-in-the-pack');

    expect(await store.getMastery(USER, 'not-in-the-pack')).toMatchObject({
      evidenceCount: 6,
      masteredAt: null,
    });
    expect(mastered).not.toHaveBeenCalled();
    expect(errors).toHaveLength(6);
    expect(String(errors[0])).toContain('not-in-the-pack');
  });

  it('a failing store reaches onError, not the bus, and the other descriptor still counts', async () => {
    const store = createInMemoryMasteryStore();
    const busErrors = vi.fn();
    const bus = createEventBus({ onError: busErrors });
    const errors: unknown[] = [];
    const realAppend = store.appendAttemptOutcome.bind(store);
    store.appendAttemptOutcome = async (userId, candoId, outcome) => {
      if (candoId === 'a1-rea') throw new Error('disk full');
      await realAppend(userId, candoId, outcome);
    };
    createProgress({
      store,
      bus,
      listCandos: async () => CANDOS,
      onError: (error, context) => errors.push({ error, context }),
    }).attach();

    await bus.emit('attempt.recorded', {
      userId: USER,
      attemptId: 'attempt-1',
      exerciseType: 'cloze',
      correct: true,
      score: 1,
      candoIds: ['a1-rea', 'a1-lis'],
      itemIds: [],
      language: 'de',
    });

    expect(busErrors).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        error: new Error('disk full'),
        context: { event: 'attempt.recorded', userId: USER, candoId: 'a1-rea' },
      },
    ]);
    expect(await store.getMastery(USER, 'a1-rea')).toBeNull();
    expect((await store.getMastery(USER, 'a1-lis'))?.evidenceCount).toBe(1);
  });

  it('a failing descriptor list is reported; evidence and the streak are still recorded', async () => {
    const store = createInMemoryMasteryStore();
    const busErrors = vi.fn();
    const bus = createEventBus({ onError: busErrors });
    const onError = vi.fn();
    const progress = createProgress({
      store,
      bus,
      listCandos: async () => {
        throw new Error('curriculum is down');
      },
      now: () => new Date(START),
      onError,
    });
    progress.attach();

    await bus.emit('attempt.recorded', {
      userId: USER,
      attemptId: 'attempt-1',
      exerciseType: 'cloze',
      correct: true,
      score: 1,
      candoIds: ['a1-rea'],
      itemIds: [],
      language: 'de',
    });

    expect(busErrors).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((await store.getMastery(USER, 'a1-rea'))?.evidenceCount).toBe(1);
    expect((await progress.streak(USER, 'de')).currentDays).toBe(1);
  });

  it('attach returns a function that detaches', async () => {
    const store = createInMemoryMasteryStore();
    const bus = createEventBus();
    const detach = createProgress({ store, bus, listCandos: async () => CANDOS }).attach();
    expect(bus.listenerCount('attempt.recorded')).toBe(1);
    // `writing.graded` carries no descriptor ids, so nothing listens to it.
    expect(bus.listenerCount('writing.graded')).toBe(0);
    detach();
    expect(bus.listenerCount()).toBe(0);
  });
});

describe('recordProductionScore', () => {
  it('a writing descriptor is not mastered until a production score of 3 arrives', async () => {
    const { store, progress, mastered, sixCorrect, advance } = setup();

    await sixCorrect('a1-wri');
    expect((await store.getMastery(USER, 'a1-wri'))?.masteredAt).toBeNull();

    advance(60_000);
    await progress.recordProductionScore(USER, 'a1-wri', 2);
    expect(await store.getMastery(USER, 'a1-wri')).toMatchObject({
      bestProductionScore: 2,
      masteredAt: null,
    });
    expect(mastered).not.toHaveBeenCalled();

    advance(60_000);
    await progress.recordProductionScore(USER, 'a1-wri', 3);
    expect(await store.getMastery(USER, 'a1-wri')).toMatchObject({
      evidenceCount: 6,
      bestProductionScore: 3,
      masteredAt: '2026-11-06T10:02:00.000Z',
    });
    expect(mastered).toHaveBeenCalledTimes(1);
    expect(mastered).toHaveBeenCalledWith({ userId: USER, candoId: 'a1-wri', level: 'A1' });
  });

  it('a score that arrives first is kept, and the attempts then complete the rule', async () => {
    const { store, progress, mastered, sixCorrect } = setup();

    await progress.recordProductionScore(USER, 'a1-spi', 4);
    expect(await store.getMastery(USER, 'a1-spi')).toMatchObject({
      evidenceCount: 0,
      bestProductionScore: 4,
      recentAccuracy: null,
      masteredAt: null,
    });

    await sixCorrect('a1-spi');
    expect(mastered).toHaveBeenCalledTimes(1);
  });

  it('keeps the best score and never emits twice', async () => {
    const { store, progress, mastered, sixCorrect } = setup();
    await sixCorrect('a1-wri');

    await progress.recordProductionScore(USER, 'a1-wri', 4.5);
    await progress.recordProductionScore(USER, 'a1-wri', 1);
    await progress.recordProductionScore(USER, 'a1-wri', 5);

    expect((await store.getMastery(USER, 'a1-wri'))?.bestProductionScore).toBe(5);
    expect(mastered).toHaveBeenCalledTimes(1);
  });

  it('honours a descriptor that asks for 4 of 5', async () => {
    const strict = cando('c2-wri', 'C2', 'writing', { masteryRule: { bestProductionScore: 4 } });
    const { progress, mastered, sixCorrect } = setup([...CANDOS, strict]);
    await sixCorrect('c2-wri');

    await progress.recordProductionScore(USER, 'c2-wri', 3);
    expect(mastered).not.toHaveBeenCalled();
    await progress.recordProductionScore(USER, 'c2-wri', 4);
    expect(mastered).toHaveBeenCalledWith({ userId: USER, candoId: 'c2-wri', level: 'C2' });
  });

  it.each([-1, 5.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the score %s',
    async (score) => {
      const { store, progress } = setup();
      await expect(progress.recordProductionScore(USER, 'a1-wri', score)).rejects.toMatchObject({
        name: 'ProgressValidationError',
        field: 'score',
      });
      expect(await store.listMastery(USER)).toEqual([]);
    },
  );

  it('rejects an unknown descriptor and stores nothing', async () => {
    const { store, progress } = setup();
    const call = progress.recordProductionScore(USER, 'nope', 3);
    await expect(call).rejects.toBeInstanceOf(ProgressValidationError);
    await expect(call).rejects.toMatchObject({ field: 'candoId' });
    expect(await store.listMastery(USER)).toEqual([]);
  });
});

describe('streak', () => {
  it('is zero before any activity', async () => {
    const { progress } = setup();
    expect(await progress.streak(USER, 'de')).toEqual({
      userId: USER,
      languageCode: 'de',
      currentDays: 0,
      longestDays: 0,
      lastActiveDate: null,
    });
  });

  it('counts a day once, however many attempts it holds', async () => {
    const { progress, attempt, advance } = setup();

    await attempt('a1-rea');
    await attempt('a1-rea');
    advance(3 * 3_600_000);
    await attempt('a1-lis', 'listen_answer', false);

    expect(await progress.streak(USER, 'de')).toEqual({
      userId: USER,
      languageCode: 'de',
      currentDays: 1,
      longestDays: 1,
      lastActiveDate: '2026-11-06',
    });
  });

  it('grows by one for each consecutive day', async () => {
    const { progress, attempt, advance } = setup();

    await attempt('a1-rea');
    advance(DAY);
    await attempt('a1-rea');
    advance(DAY);
    await attempt('a1-rea');

    expect(await progress.streak(USER, 'de')).toMatchObject({
      currentDays: 3,
      longestDays: 3,
      lastActiveDate: '2026-11-08',
    });
  });

  it('uses the UTC calendar day, not 24 hours', async () => {
    const { progress, attempt, advance } = setup();

    // 10:00 on the 6th, then 00:30 on the 7th: fourteen and a half hours later.
    await attempt('a1-rea');
    advance(14.5 * 3_600_000);
    await attempt('a1-rea');
    expect((await progress.streak(USER, 'de')).currentDays).toBe(2);

    // 23:30 on the 8th is 47 hours later and still the next day.
    advance(47 * 3_600_000);
    await attempt('a1-rea');
    expect((await progress.streak(USER, 'de')).currentDays).toBe(3);
  });

  it('a gap resets to 1 and the longest streak is kept', async () => {
    const { progress, attempt, advance } = setup();

    await attempt('a1-rea');
    advance(DAY);
    await attempt('a1-rea');
    advance(DAY);
    await attempt('a1-rea');
    advance(2 * DAY);
    await attempt('a1-rea');

    expect(await progress.streak(USER, 'de')).toMatchObject({
      currentDays: 1,
      longestDays: 3,
      lastActiveDate: '2026-11-10',
    });
  });

  it('reads as 0 current days once a day has been missed', async () => {
    const { progress, attempt, advance } = setup();
    await attempt('a1-rea');
    advance(DAY);
    await attempt('a1-rea');

    advance(DAY);
    // Yesterday was active: the streak is still alive today.
    expect((await progress.streak(USER, 'de')).currentDays).toBe(2);
    advance(DAY);
    expect(await progress.streak(USER, 'de')).toMatchObject({
      currentDays: 0,
      longestDays: 2,
      lastActiveDate: '2026-11-07',
    });
  });

  it('is kept per language and per user', async () => {
    const { progress, bus, attempt } = setup();
    await attempt('a1-rea');
    await bus.emit('attempt.recorded', {
      userId: 'user-2',
      attemptId: 'other-1',
      exerciseType: 'cloze',
      correct: true,
      score: 1,
      candoIds: [],
      itemIds: [],
      language: 'nl',
    });

    expect((await progress.streak(USER, 'de')).currentDays).toBe(1);
    expect((await progress.streak(USER, 'nl')).currentDays).toBe(0);
    expect((await progress.streak('user-2', 'nl')).currentDays).toBe(1);
    expect((await progress.streak('user-2', 'de')).currentDays).toBe(0);
  });
});

describe('recordEstimate', () => {
  it('appends every estimate and emits level.reached only when the level rises', async () => {
    const { store, progress, reached, advance } = setup();

    await progress.recordEstimate(USER, 'de', 'A2', 0.6, 'placement');
    expect(reached).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenLastCalledWith({
      userId: USER,
      language: 'de',
      level: 'A2',
      method: 'placement',
    });

    advance(1000);
    await progress.recordEstimate(USER, 'de', 'A2', 0.9, 'checkpoint'); // same level
    advance(1000);
    await progress.recordEstimate(USER, 'de', 'A1', 0.7, 'manual'); // lower
    expect(reached).toHaveBeenCalledTimes(1);

    advance(1000);
    await progress.recordEstimate(USER, 'de', 'B1', 0.8, 'checkpoint'); // rises above A1
    expect(reached).toHaveBeenCalledTimes(2);
    expect(reached).toHaveBeenLastCalledWith({
      userId: USER,
      language: 'de',
      level: 'B1',
      method: 'checkpoint',
    });

    const rows = await store.listEstimates(USER, 'de');
    expect(rows.map((row) => row.level)).toEqual(['A2', 'A2', 'A1', 'B1']);
    expect(rows[0]).toEqual({
      userId: USER,
      languageCode: 'de',
      level: 'A2',
      confidence: 0.6,
      method: 'placement',
      createdAt: '2026-11-06T10:00:00.000Z',
    });
  });

  it('compares within one language and one user', async () => {
    const { progress, reached } = setup();
    await progress.recordEstimate(USER, 'de', 'B2', 0.8, 'placement');
    await progress.recordEstimate(USER, 'nl', 'A1', 0.8, 'placement');
    await progress.recordEstimate('user-2', 'de', 'A1', 0.8, 'placement');
    expect(reached).toHaveBeenCalledTimes(3);
  });

  it('rejects a bad level, confidence or method and stores nothing', async () => {
    const { store, progress, reached } = setup();
    const bad = <T>(value: unknown) => value as T;

    await expect(
      progress.recordEstimate(USER, 'de', bad('C3'), 0.5, 'manual'),
    ).rejects.toMatchObject({ name: 'ProgressValidationError', field: 'level' });
    for (const confidence of [-0.1, 1.1, Number.NaN]) {
      await expect(
        progress.recordEstimate(USER, 'de', 'A1', confidence, 'manual'),
      ).rejects.toMatchObject({ field: 'confidence' });
    }
    await expect(
      progress.recordEstimate(USER, 'de', 'A1', 0.5, bad('guess')),
    ).rejects.toMatchObject({ field: 'method' });

    expect(await store.listEstimates(USER, 'de')).toEqual([]);
    expect(reached).not.toHaveBeenCalled();
  });
});

/** Masters every A1 descriptor of the fixture, production ones included. */
async function masterA1(ctx: ReturnType<typeof setup>): Promise<void> {
  for (const id of ['a1-rea', 'a1-lis', 'a1-gra', 'a1-wri', 'a1-spi']) await ctx.sixCorrect(id);
  await ctx.progress.recordProductionScore(USER, 'a1-wri', 3);
  await ctx.progress.recordProductionScore(USER, 'a1-spi', 4);
}

describe('levelEstimate', () => {
  it('is null without any estimate', async () => {
    const { progress } = setup();
    expect(await progress.levelEstimate(USER, 'de')).toBeNull();
  });

  it('is the latest recorded estimate while no level is reached', async () => {
    const { progress, advance } = setup();
    await progress.recordEstimate(USER, 'de', 'B1', 0.5, 'placement');
    advance(1000);
    await progress.recordEstimate(USER, 'de', 'A2', 0.7, 'manual');

    expect(await progress.levelEstimate(USER, 'de')).toEqual({
      userId: USER,
      languageCode: 'de',
      level: 'A2',
      confidence: 0.7,
      method: 'manual',
      createdAt: '2026-11-06T10:00:01.000Z',
    });
  });

  it('mastery without a checkpoint does not reach the level', async () => {
    const ctx = setup();
    await masterA1(ctx);
    expect(ctx.mastered).toHaveBeenCalledTimes(5);
    expect(await ctx.progress.levelEstimate(USER, 'de')).toBeNull();
  });

  it('a checkpoint without the mastery does not reach the level either', async () => {
    const ctx = setup();
    await ctx.progress.recordEstimate(USER, 'de', 'A1', 0.9, 'checkpoint');
    const map = await ctx.progress.levelMap(USER, 'de');
    expect(map.levels[0]).toMatchObject({ status: 'working_towards', checkpoint: 'passed' });
  });

  it('is the highest reached level, even when a later estimate says otherwise', async () => {
    const ctx = setup();
    await masterA1(ctx);
    ctx.advance(1000);
    await ctx.progress.recordEstimate(USER, 'de', 'A1', 0.91, 'checkpoint');
    ctx.advance(1000);
    await ctx.progress.recordEstimate(USER, 'de', 'B1', 0.4, 'placement');

    expect(await ctx.progress.levelEstimate(USER, 'de')).toEqual({
      userId: USER,
      languageCode: 'de',
      level: 'A1',
      confidence: 0.91,
      method: 'checkpoint',
      createdAt: '2026-11-06T10:00:01.000Z',
    });
  });
});

describe('masteryFor', () => {
  it('returns the rows of the language in descriptor order, or of one level', async () => {
    const { progress, attempt } = setup();
    await attempt('a2-rea');
    await attempt('a1-gra');
    await attempt('a1-rea');
    await attempt('not-in-the-pack');

    const all = await progress.masteryFor(USER, 'de');
    expect(all.map((row) => row.candoId)).toEqual(['a1-rea', 'a1-gra', 'a2-rea']);
    const a2 = await progress.masteryFor(USER, 'de', 'A2');
    expect(a2.map((row) => row.candoId)).toEqual(['a2-rea']);
    expect(await progress.masteryFor(USER, 'de', 'C1')).toEqual([]);
    expect(await progress.masteryFor('user-2', 'de')).toEqual([]);
  });
});

describe('levelMap', () => {
  it('returns six levels, A1 first, each with its descriptors and counts', async () => {
    const { progress, sixCorrect, attempt } = setup();
    await sixCorrect('a1-rea');
    await attempt('a1-gra');

    const map = await progress.levelMap(USER, 'de');

    expect(map.userId).toBe(USER);
    expect(map.languageCode).toBe('de');
    expect(map.estimate).toBeNull();
    expect(map.levels.map((row) => row.level)).toEqual([...CEFR_LEVELS]);
    expect(map.levels.map((row) => [row.masteredCount, row.totalCount])).toEqual([
      [1, 5],
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(map.levels.map((row) => row.status)).toEqual([
      'working_towards',
      'not_started',
      'not_started',
      'not_started',
      'not_started',
      'not_started',
    ]);
    expect(map.levels.map((row) => row.checkpoint)).toEqual(Array(6).fill('locked'));

    const a1 = map.levels[0];
    // Every descriptor of the level is listed; `mastery` is null without evidence.
    expect(a1?.descriptors.map((d) => [d.cando.id, d.mastery?.evidenceCount ?? null])).toEqual([
      ['a1-rea', 6],
      ['a1-lis', null],
      ['a1-gra', 1],
      ['a1-wri', null],
      ['a1-spi', null],
    ]);
    expect(a1?.descriptors[0]?.cando).toEqual(CANDOS[0]);
    // `candos` is the contracts field: the rows that exist, in descriptor order.
    expect(a1?.candos.map((row) => row.candoId)).toEqual(['a1-rea', 'a1-gra']);
    expect(a1?.candos[0]?.masteredAt).toBe('2026-11-06T10:00:00.000Z');
  });

  it('walks a level from locked to available to passed and reached', async () => {
    const ctx = setup();
    const a1 = async () => (await ctx.progress.levelMap(USER, 'de')).levels[0];

    // All three receptive descriptors mastered: 60 percent, no production evidence.
    for (const id of ['a1-rea', 'a1-lis', 'a1-gra']) await ctx.sixCorrect(id);
    expect(await a1()).toMatchObject({
      masteredCount: 3,
      status: 'working_towards',
      checkpoint: 'locked',
    });

    // One production descriptor mastered: 80 percent opens the checkpoint.
    await ctx.sixCorrect('a1-wri');
    await ctx.progress.recordProductionScore(USER, 'a1-wri', 3);
    expect(await a1()).toMatchObject({
      masteredCount: 4,
      status: 'working_towards',
      checkpoint: 'available',
    });

    // Checkpoint passed, but one production descriptor is still open.
    await ctx.progress.recordEstimate(USER, 'de', 'A1', 0.9, 'checkpoint');
    expect(await a1()).toMatchObject({ status: 'working_towards', checkpoint: 'passed' });

    await ctx.sixCorrect('a1-spi');
    await ctx.progress.recordProductionScore(USER, 'a1-spi', 3);
    const map = await ctx.progress.levelMap(USER, 'de');
    expect(map.levels[0]).toMatchObject({
      masteredCount: 5,
      totalCount: 5,
      status: 'reached',
      checkpoint: 'passed',
    });
    expect(map.estimate).toMatchObject({ level: 'A1', method: 'checkpoint', confidence: 0.9 });
    expect(map.levels[1]).toMatchObject({ status: 'not_started', checkpoint: 'locked' });
  });

  it('a checkpoint recorded for another level or by another method does not count', async () => {
    const ctx = setup();
    await masterA1(ctx);
    await ctx.progress.recordEstimate(USER, 'de', 'A2', 0.9, 'checkpoint');
    await ctx.progress.recordEstimate(USER, 'de', 'A1', 0.9, 'placement');

    const map = await ctx.progress.levelMap(USER, 'de');
    expect(map.levels[0]).toMatchObject({ status: 'working_towards', checkpoint: 'available' });
    expect(map.levels[1]).toMatchObject({ status: 'working_towards', checkpoint: 'passed' });
    // No level is reached, so the estimate is the latest recorded one.
    expect(map.estimate).toMatchObject({ level: 'A1', method: 'placement' });
  });
});

describe('re-entrancy', () => {
  it('a cando.mastered listener may call back into the service', async () => {
    const ctx = setup();
    const seen: number[] = [];
    ctx.bus.on('cando.mastered', async ({ userId }) => {
      await ctx.progress.recordEstimate(userId, 'de', 'A1', 0.5, 'mastery_ratio');
      seen.push((await ctx.progress.masteryFor(userId, 'de')).length);
    });

    await ctx.sixCorrect('a1-rea');

    expect(seen).toEqual([1]);
    expect(ctx.reached).toHaveBeenCalledTimes(1);
  });
});

describe('createInMemoryMasteryStore', () => {
  const at = '2026-11-06T10:00:00.000Z';
  const row = {
    userId: USER,
    candoId: 'a1-rea',
    evidenceCount: 1,
    correctCount: 1,
    exerciseTypesSeen: ['cloze' as const],
    bestProductionScore: null,
    recentAccuracy: 1,
    masteredAt: null,
    updatedAt: at,
  };

  it('upserts by user and descriptor and hands out copies', async () => {
    const store = createInMemoryMasteryStore();
    expect(await store.getMastery(USER, 'a1-rea')).toBeNull();

    await store.upsertMastery(row);
    await store.upsertMastery({ ...row, evidenceCount: 2 });
    await store.upsertMastery({ ...row, userId: 'user-2' });
    expect(await store.listMastery(USER)).toEqual([{ ...row, evidenceCount: 2 }]);

    const copy = await store.getMastery(USER, 'a1-rea');
    copy?.exerciseTypesSeen.push('dictation');
    expect((await store.getMastery(USER, 'a1-rea'))?.exerciseTypesSeen).toEqual(['cloze']);
  });

  it('returns the last attempts oldest first, up to the limit', async () => {
    const store = createInMemoryMasteryStore();
    for (let i = 0; i < 12; i++) {
      await store.appendAttemptOutcome(USER, 'a1-rea', {
        correct: i >= 4,
        exerciseType: 'cloze',
        at: new Date(START + i * 1000).toISOString(),
      });
    }

    const recent = await store.recentOutcomes(USER, 'a1-rea', 10);
    expect(recent).toHaveLength(10);
    expect(recent.map((outcome) => outcome.correct)).toEqual([
      ...Array(2).fill(false),
      ...Array(8).fill(true),
    ]);
    expect(recent.at(-1)?.at).toBe('2026-11-06T10:00:11.000Z');
    expect(await store.recentOutcomes(USER, 'a1-rea', 0)).toEqual([]);
    expect(await store.recentOutcomes(USER, 'a1-lis', 10)).toEqual([]);
    expect(await store.recentOutcomes('user-2', 'a1-rea', 10)).toEqual([]);
  });

  it('appends estimates and reads the latest per user and language', async () => {
    const store = createInMemoryMasteryStore();
    const estimate = {
      userId: USER,
      languageCode: 'de' as const,
      level: 'A1' as const,
      confidence: 0.5,
      method: 'placement' as const,
      createdAt: at,
    };
    expect(await store.latestEstimate(USER, 'de')).toBeNull();

    await store.insertEstimate(estimate);
    await store.insertEstimate({ ...estimate, level: 'A2' });
    await store.insertEstimate({ ...estimate, languageCode: 'nl', level: 'B1' });

    expect((await store.latestEstimate(USER, 'de'))?.level).toBe('A2');
    expect((await store.listEstimates(USER, 'de')).map((e) => e.level)).toEqual(['A1', 'A2']);
    expect((await store.latestEstimate(USER, 'nl'))?.level).toBe('B1');
    expect(await store.latestEstimate('user-2', 'de')).toBeNull();
  });

  it('upserts the streak by user and language', async () => {
    const store = createInMemoryMasteryStore();
    const streak = {
      userId: USER,
      languageCode: 'de' as const,
      currentDays: 1,
      longestDays: 1,
      lastActiveDate: '2026-11-06',
    };
    expect(await store.getStreak(USER, 'de')).toBeNull();
    await store.upsertStreak(streak);
    await store.upsertStreak({ ...streak, currentDays: 2, longestDays: 2 });
    expect(await store.getStreak(USER, 'de')).toEqual({
      ...streak,
      currentDays: 2,
      longestDays: 2,
    });
    expect(await store.getStreak(USER, 'nl')).toBeNull();
  });
});
