// Integration test for the Postgres adapter. Needs a real PostgreSQL with the
// migrations applied and is skipped when DATABASE_URL is not set. See "How to
// test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-progress test
//
// It creates its own rows through the owner connection: users (then
// ensure_profile, the way core-auth does at sign up) and descriptors in
// cando_descriptors with random ids, unique codes and language 'nl'. At the
// end it deletes exactly those users and descriptors. The deletes cascade to
// profiles, entitlements, cando_mastery, cando_outcomes, level_estimates and
// streaks. Nothing else in the database is changed.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { Cando, CefrLevel, EventMap, ExerciseTypeId, Skill } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createPostgresMasteryStore, createProgress } from '../src/index';
import type { ListCandos, MasteryStore } from '../src/index';
import {
  insertOutcome,
  selectEstimates,
  selectMastery,
  selectMasteryRows,
  selectRecentOutcomes,
  selectStreak,
  upsertMasteryRow,
} from '../src/postgres-store';
import { runMasteryStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('Postgres MasteryStore on a real Postgres', () => {
  const createdUsers: string[] = [];
  const createdCandos: string[] = [];
  let db: Database;
  let store: MasteryStore;

  /** A user with a profile, created as the owner. Remembered for the clean up. */
  async function newUser(): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p131-${id}@example.test`, name: null })
      .execute();
    await sql`select ensure_profile(${id}::uuid)`.execute(db);
    return id;
  }

  /** A descriptor in cando_descriptors, created as the owner. */
  async function newCando(skill: Skill = 'reading', level: CefrLevel = 'A1'): Promise<Cando> {
    const id = randomUUID();
    createdCandos.push(id);
    const cando: Cando = {
      id,
      languageCode: 'nl',
      level,
      skill,
      code: `P131.${id}`,
      textEn: `Integration test descriptor ${id}`,
      textNative: null,
      source: 'p131-integration-test',
      masteryRule: null,
    };
    await db
      .insertInto('cando_descriptors')
      .values({
        id,
        language_code: cando.languageCode,
        level,
        skill,
        code: cando.code,
        text_en: cando.textEn,
        source: cando.source,
      })
      .execute();
    return cando;
  }

  beforeAll(() => {
    db = createDb(url as string);
    store = createPostgresMasteryStore(db);
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    }
    if (createdCandos.length > 0) {
      await db.deleteFrom('cando_descriptors').where('id', 'in', createdCandos).execute();
    }
    await db.destroy();
  });

  runMasteryStoreContract('Postgres', () => ({
    store,
    newUserId: () => newUser(),
    newCandoId: async () => (await newCando()).id,
  }));

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

  // 20:00 UTC is already the next calendar day in Asia/Kolkata and still the
  // previous one in America/Los_Angeles, so a day that passed through a local
  // Date would show.
  const START = Date.parse('2026-11-06T20:00:00.000Z');
  const DAY = 86_400_000;

  /** The service on a Postgres store with the real bus and a clock the test controls. */
  function setup(candos: Cando[], userId: string, masteryStore: MasteryStore = store) {
    const bus = createEventBus();
    const mastered: EventMap['cando.mastered'][] = [];
    const reached: EventMap['level.reached'][] = [];
    bus.on('cando.mastered', async (payload) => {
      mastered.push(payload);
    });
    bus.on('level.reached', async (payload) => {
      reached.push(payload);
    });
    const errors: unknown[] = [];
    let time = START;
    const listCandos: ListCandos = async (language, level) =>
      candos.filter(
        (c) => c.languageCode === language && (level === undefined || c.level === level),
      );
    const progress = createProgress({
      store: masteryStore,
      bus,
      listCandos,
      now: () => new Date(time),
      onError: (error) => errors.push(error),
    });
    const detach = progress.attach();

    /** Emits one `attempt.recorded`, the way core-exercises does. */
    async function attempt(
      candoId: string,
      exerciseType: ExerciseTypeId = 'cloze',
      correct = true,
    ): Promise<void> {
      await bus.emit('attempt.recorded', {
        userId,
        attemptId: randomUUID(),
        exerciseType,
        correct,
        score: correct ? 1 : 0,
        candoIds: [candoId],
        itemIds: [],
        language: 'nl',
      });
    }

    /** Six correct attempts in two exercise types, all at the same clock time. */
    async function sixCorrect(candoId: string): Promise<void> {
      for (let i = 0; i < 3; i += 1) await attempt(candoId, 'cloze');
      for (let i = 0; i < 3; i += 1) await attempt(candoId, 'multiple_choice');
    }

    return {
      progress,
      mastered,
      reached,
      errors,
      attempt,
      sixCorrect,
      detach,
      advance(ms: number) {
        time += ms;
      },
    };
  }

  describe('createProgress on the Postgres store', () => {
    it('six correct attempts in two exercise types master a reading descriptor and emit once', async () => {
      const userId = await newUser();
      const reading = await newCando('reading');
      const { progress, mastered, errors, attempt, sixCorrect } = setup([reading], userId);

      for (let i = 0; i < 3; i += 1) await attempt(reading.id, 'cloze');
      for (let i = 0; i < 2; i += 1) await attempt(reading.id, 'multiple_choice');
      expect(mastered).toEqual([]);
      expect((await store.getMastery(userId, reading.id))?.masteredAt).toBeNull();

      await attempt(reading.id, 'multiple_choice');
      // More evidence after mastery: no second event.
      await sixCorrect(reading.id);

      expect(errors).toEqual([]);
      expect(mastered).toEqual([{ userId, candoId: reading.id, level: 'A1' }]);
      // The row as the owner sees it in the table, outside row security.
      const row = await db
        .selectFrom('cando_mastery')
        .selectAll()
        .where('user_id', '=', userId)
        .where('cando_id', '=', reading.id)
        .executeTakeFirstOrThrow();
      expect(row.mastered_at?.toISOString()).toBe(new Date(START).toISOString());
      expect(row.evidence_count).toBe(12);
      expect(row.correct_count).toBe(12);
      expect(row.exercise_types_seen).toEqual(['cloze', 'multiple_choice']);
      expect(Number(row.recent_accuracy)).toBe(1);
      const rows = await progress.masteryFor(userId, 'nl', 'A1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ candoId: reading.id, evidenceCount: 12 });
    });

    it('wrong attempts keep a descriptor unmastered until the last ten are good enough', async () => {
      const userId = await newUser();
      const reading = await newCando('reading');
      const { mastered, errors, attempt } = setup([reading], userId);

      // 3 wrong then 7 correct: 70 percent of ten, under the 80 percent rule.
      for (let i = 0; i < 3; i += 1) await attempt(reading.id, 'cloze', false);
      for (let i = 0; i < 4; i += 1) await attempt(reading.id, 'cloze');
      for (let i = 0; i < 3; i += 1) await attempt(reading.id, 'dictation');
      expect(mastered).toEqual([]);
      expect((await store.getMastery(userId, reading.id))?.recentAccuracy).toBe(0.7);

      // One more correct attempt pushes a wrong one out of the window: 8 of 10.
      await attempt(reading.id, 'dictation');

      expect(errors).toEqual([]);
      expect(mastered).toHaveLength(1);
      const stored = await store.getMastery(userId, reading.id);
      expect(stored).toMatchObject({ evidenceCount: 11, correctCount: 8, recentAccuracy: 0.8 });
      expect(stored?.masteredAt).not.toBeNull();
    });

    it('a writing descriptor is mastered only after recordProductionScore 3', async () => {
      const userId = await newUser();
      const writing = await newCando('writing');
      const { progress, mastered, errors, sixCorrect } = setup([writing], userId);

      await sixCorrect(writing.id);
      expect(mastered).toEqual([]);
      await progress.recordProductionScore(userId, writing.id, 2.5);
      expect(mastered).toEqual([]);
      expect(await store.getMastery(userId, writing.id)).toMatchObject({
        bestProductionScore: 2.5,
        masteredAt: null,
      });

      await progress.recordProductionScore(userId, writing.id, 3);
      // A lower score later neither lowers the best score nor emits again.
      await progress.recordProductionScore(userId, writing.id, 1);

      expect(errors).toEqual([]);
      expect(mastered).toEqual([{ userId, candoId: writing.id, level: 'A1' }]);
      const stored = await store.getMastery(userId, writing.id);
      expect(stored?.bestProductionScore).toBe(3);
      expect(stored?.masteredAt).toBe(new Date(START).toISOString());
    });

    it('a C1 writing descriptor needs a score of 4', async () => {
      const userId = await newUser();
      const writing = await newCando('writing', 'C1');
      const { progress, mastered, sixCorrect } = setup([writing], userId);
      await sixCorrect(writing.id);

      await progress.recordProductionScore(userId, writing.id, 3);
      expect(mastered).toEqual([]);
      await progress.recordProductionScore(userId, writing.id, 4);

      expect(mastered).toEqual([{ userId, candoId: writing.id, level: 'C1' }]);
    });

    it('the streak survives a fresh store instance and the date comes back unshifted', async () => {
      const userId = await newUser();
      const reading = await newCando('reading');
      const first = setup([reading], userId);

      await first.attempt(reading.id);
      await first.attempt(reading.id);
      expect(await first.progress.streak(userId, 'nl')).toEqual({
        userId,
        languageCode: 'nl',
        currentDays: 1,
        longestDays: 1,
        lastActiveDate: '2026-11-06',
      });
      first.detach();

      // A second connection pool and a second store, as after a restart.
      const otherDb = createDb(url as string);
      try {
        const second = setup([reading], userId, createPostgresMasteryStore(otherDb));
        second.advance(DAY);
        await second.attempt(reading.id);

        expect(second.errors).toEqual([]);
        expect(await second.progress.streak(userId, 'nl')).toMatchObject({
          currentDays: 2,
          longestDays: 2,
          lastActiveDate: '2026-11-07',
        });

        // Three days later the streak restarts and the longest one is kept.
        second.advance(3 * DAY);
        await second.attempt(reading.id);
        expect(await second.progress.streak(userId, 'nl')).toMatchObject({
          currentDays: 1,
          longestDays: 2,
          lastActiveDate: '2026-11-10',
        });
      } finally {
        await otherDb.destroy();
      }

      // What the date column itself holds, read as the owner.
      const raw = await sql<{ day: string }>`
        select last_active_date::text as day from streaks where user_id = ${userId}::uuid
      `.execute(db);
      expect(raw.rows).toEqual([{ day: '2026-11-10' }]);
      expect(await store.getStreak(userId, 'nl')).toEqual({
        userId,
        languageCode: 'nl',
        currentDays: 1,
        longestDays: 2,
        lastActiveDate: '2026-11-10',
      });
    });

    it('recordEstimate, levelEstimate and levelMap work on stored rows', async () => {
      const userId = await newUser();
      const reading = await newCando('reading');
      const writing = await newCando('writing');
      const { progress, reached, errors, sixCorrect } = setup([reading, writing], userId);

      expect(await progress.levelEstimate(userId, 'nl')).toBeNull();
      // Same clock time for both: the second one must still read as the latest.
      await progress.recordEstimate(userId, 'nl', 'A2', 0.625, 'placement');
      await progress.recordEstimate(userId, 'nl', 'A1', 0.5, 'manual');
      expect(await progress.levelEstimate(userId, 'nl')).toMatchObject({
        level: 'A1',
        confidence: 0.5,
        method: 'manual',
      });
      expect(reached).toEqual([{ userId, language: 'nl', level: 'A2', method: 'placement' }]);

      await sixCorrect(reading.id);
      await sixCorrect(writing.id);
      await progress.recordProductionScore(userId, writing.id, 4);
      await progress.recordEstimate(userId, 'nl', 'A1', 0.9, 'checkpoint');

      expect(errors).toEqual([]);
      const map = await progress.levelMap(userId, 'nl');
      expect(map.levels[0]).toMatchObject({
        level: 'A1',
        masteredCount: 2,
        totalCount: 2,
        status: 'reached',
        checkpoint: 'passed',
      });
      expect(map.estimate).toMatchObject({ level: 'A1', confidence: 0.9, method: 'checkpoint' });
      expect(await store.listEstimates(userId, 'nl')).toHaveLength(3);
    });

    it('an attempt for a descriptor that is not in cando_descriptors is reported and stores no evidence', async () => {
      const userId = await newUser();
      const reading = await newCando('reading');
      const missing = randomUUID();
      const { errors, attempt } = setup([reading], userId);

      await attempt(missing);
      await attempt(reading.id);

      // One report from the service (not in the list), one from the foreign key.
      expect(errors).toHaveLength(2);
      expect(await store.getMastery(userId, missing)).toBeNull();
      expect(await store.recentOutcomes(userId, missing, 10)).toEqual([]);
      // The failure did not stop the next attempt or the streak.
      expect((await store.getMastery(userId, reading.id))?.evidenceCount).toBe(1);
      expect((await store.getStreak(userId, 'nl'))?.currentDays).toBe(1);
    });
  });

  // The port has no separate "who is asking": every method acts for the user
  // id it is given. So the cross user checks run the adapter's own statements
  // inside user B's transaction and point them at user A.
  describe('row security: user B against user A', () => {
    /** User A with a mastered descriptor, six outcomes, an estimate and a streak. */
    async function userWithProgress() {
      const a = await newUser();
      const b = await newUser();
      const reading = await newCando('reading');
      const { progress, sixCorrect } = setup([reading], a);
      await sixCorrect(reading.id);
      await progress.recordEstimate(a, 'nl', 'A2', 0.75, 'placement');
      return { a, b, candoId: reading.id };
    }

    it("B cannot see A's mastery", async () => {
      const { a, b, candoId } = await userWithProgress();

      const seen = await withUser(db, b, async (trx) => ({
        one: await selectMastery(trx, a, candoId),
        list: await selectMasteryRows(trx, a),
        // No user filter at all: row security alone decides.
        count: await trx
          .selectFrom('cando_mastery')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow(),
      }));

      expect(seen).toEqual({ one: null, list: [], count: { n: '0' } });
      // A still sees the row.
      expect((await store.getMastery(a, candoId))?.masteredAt).not.toBeNull();
    });

    it("B cannot see A's outcomes, estimates or streak", async () => {
      const { a, b, candoId } = await userWithProgress();

      const seen = await withUser(db, b, async (trx) => ({
        outcomes: await selectRecentOutcomes(trx, a, candoId, 10),
        outcomeCount: await trx
          .selectFrom('cando_outcomes')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow(),
        estimates: await selectEstimates(trx, a, 'nl'),
        streak: await selectStreak(trx, a, 'nl'),
      }));

      expect(seen).toEqual({ outcomes: [], outcomeCount: { n: '0' }, estimates: [], streak: null });
      expect(await store.recentOutcomes(a, candoId, 10)).toHaveLength(6);
      expect(await store.listEstimates(a, 'nl')).toHaveLength(1);
      expect((await store.getStreak(a, 'nl'))?.currentDays).toBe(1);
    });

    it("B cannot write A's mastery or append to A's outcomes", async () => {
      const { a, b, candoId } = await userWithProgress();
      const before = await store.getMastery(a, candoId);
      if (!before) throw new Error('user A has no mastery row');

      // 42501 is insufficient_privilege: the row level security policy refused the row.
      const overwrite = await errorCodeOf(
        withUser(db, b, (trx) => upsertMasteryRow(trx, { ...before, evidenceCount: 0 })),
      );
      const append = await errorCodeOf(
        withUser(db, b, (trx) =>
          insertOutcome(trx, a, candoId, {
            correct: false,
            exerciseType: 'cloze',
            at: new Date(START).toISOString(),
          }),
        ),
      );

      expect(overwrite).toBe('42501');
      expect(append).toBe('42501');
      expect(await store.getMastery(a, candoId)).toEqual(before);
      expect(await store.recentOutcomes(a, candoId, 10)).toHaveLength(6);
    });

    it('outcomes are append only for the app role, even for the own rows', async () => {
      const { a, candoId } = await userWithProgress();

      const update = await errorCodeOf(
        withUser(db, a, (trx) =>
          trx
            .updateTable('cando_outcomes')
            .set({ correct: false })
            .where('user_id', '=', a)
            .execute(),
        ),
      );
      const remove = await errorCodeOf(
        withUser(db, a, (trx) =>
          trx.deleteFrom('cando_outcomes').where('user_id', '=', a).execute(),
        ),
      );

      // No grant for update or delete on cando_outcomes (migration 0005).
      expect(update).toBe('42501');
      expect(remove).toBe('42501');
      const kept = await store.recentOutcomes(a, candoId, 10);
      expect(kept.map((one) => one.correct)).toEqual([true, true, true, true, true, true]);
    });
  });

  // Where Postgres differs from the in memory adapter. The shared contract
  // leaves these points open; here they are pinned down.
  describe('what the tables decide', () => {
    const T1 = '2026-11-05T08:00:00.000Z';
    const T2 = '2026-11-05T09:00:00.000Z';
    const rowFor = (userId: string, candoId: string) => ({
      userId,
      candoId,
      evidenceCount: 3,
      correctCount: 2,
      exerciseTypesSeen: ['cloze' as const],
      bestProductionScore: null,
      recentAccuracy: 2 / 3,
      masteredAt: null,
      updatedAt: T1,
    });

    it('updatedAt is the caller value on the first write and the database clock after a replace', async () => {
      const row = rowFor(await newUser(), (await newCando()).id);
      const before = Date.now();

      await store.upsertMastery(row);
      const inserted = await store.getMastery(row.userId, row.candoId);
      await store.upsertMastery({ ...row, evidenceCount: 4, updatedAt: T2 });
      const replaced = await store.getMastery(row.userId, row.candoId);

      expect(inserted?.updatedAt).toBe(T1);
      expect(replaced?.evidenceCount).toBe(4);
      // One minute of slack for a database on another clock.
      expect(Math.abs(Date.parse(replaced?.updatedAt ?? T1) - before)).toBeLessThan(60_000);
    });

    it('recent accuracy keeps three decimals and the score two', async () => {
      const row = rowFor(await newUser(), (await newCando()).id);

      await store.upsertMastery({ ...row, bestProductionScore: 3.456 });

      const stored = await store.getMastery(row.userId, row.candoId);
      expect(stored?.recentAccuracy).toBe(0.667);
      expect(stored?.bestProductionScore).toBe(3.46);
    });

    it('listMastery orders by descriptor id', async () => {
      const userId = await newUser();
      const ids = [(await newCando()).id, (await newCando()).id, (await newCando()).id];
      for (const candoId of ids) await store.upsertMastery(rowFor(userId, candoId));

      const listed = (await store.listMastery(userId)).map((row) => row.candoId);

      // Compared as the 32 hex digits, which is how Postgres orders uuids.
      expect(listed).toEqual([...ids].sort());
    });

    it('an attempt with a time before the newest one is stored just after the newest', async () => {
      const userId = await newUser();
      const candoId = (await newCando()).id;
      await store.appendAttemptOutcome(userId, candoId, {
        correct: true,
        exerciseType: 'cloze',
        at: T2,
      });
      await store.appendAttemptOutcome(userId, candoId, {
        correct: false,
        exerciseType: 'dictation',
        at: T1,
      });

      const read = await store.recentOutcomes(userId, candoId, 10);

      expect(read).toEqual([
        { correct: true, exerciseType: 'cloze', at: T2 },
        { correct: false, exerciseType: 'dictation', at: T2 },
      ]);
    });

    it('appends racing for one history all land, each with its own stored time', async () => {
      const userId = await newUser();
      const candoId = (await newCando()).id;
      const one = { correct: true, exerciseType: 'cloze' as const, at: T1 };

      await Promise.all(
        Array.from({ length: 8 }, () => store.appendAttemptOutcome(userId, candoId, one)),
      );

      const times = await sql<{ at: string }>`
        select created_at::text as at from cando_outcomes where user_id = ${userId}::uuid
      `.execute(db);
      expect(times.rows).toHaveLength(8);
      expect(new Set(times.rows.map((row) => row.at)).size).toBe(8);
      expect(await store.recentOutcomes(userId, candoId, 10)).toEqual(
        Array.from({ length: 8 }, () => one),
      );
    });

    it('rejects a streak day that is not YYYY-MM-DD and a user id that is not a uuid', async () => {
      const userId = await newUser();
      const streak = { userId, languageCode: 'nl' as const, currentDays: 1, longestDays: 1 };

      await expect(
        store.upsertStreak({ ...streak, lastActiveDate: '2026-11-06T20:00:00.000Z' }),
      ).rejects.toThrow(/YYYY-MM-DD/);
      await expect(store.getMastery('user-1', randomUUID())).rejects.toThrow(TypeError);
      expect(await store.getStreak(userId, 'nl')).toBeNull();
    });
  });
});
