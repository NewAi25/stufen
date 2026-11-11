// The behaviour every MasteryStore adapter must show, written against the port
// only. Not a test file itself: store-contract.memory.test.ts runs it for the
// in memory store and postgres-store.integration.test.ts for Postgres.
//
// Three things are left open on purpose, because the adapters differ there:
//   * updatedAt after a replace. The in memory store keeps the caller's
//     value, Postgres sets its own clock through a trigger. The contract asks
//     for the caller's value on the first write and an ISO string afterwards.
//   * the order of listMastery. The contract compares the rows as a set.
//   * the stored time of an attempt or estimate that arrives with a time
//     before the newest one. The contract checks the order, not that time.
// Numbers are chosen to fit numeric(3,2) and numeric(4,3), the Postgres columns.
import { beforeAll, describe, expect, it } from 'vitest';
import type { CandoMastery, ExerciseTypeId, LevelEstimate, Streak } from '@stufen/contracts';
import { OUTCOME_HISTORY_LIMIT } from '../src/index';
import type { AttemptOutcome, MasteryStore } from '../src/index';

export interface MasteryStoreHarness {
  store: MasteryStore;
  /** A fresh user id the store may write for (Postgres: a profile exists). */
  newUserId(): Promise<string>;
  /** A fresh descriptor id rows may point at (Postgres: a row in cando_descriptors). */
  newCandoId(): Promise<string>;
}

const T1 = '2026-11-05T08:00:00.000Z';
const T2 = '2026-11-05T09:00:00.000Z';
const T3 = '2026-11-05T10:00:00.000Z';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function masteryRow(
  userId: string,
  candoId: string,
  override: Partial<CandoMastery> = {},
): CandoMastery {
  return {
    userId,
    candoId,
    evidenceCount: 3,
    correctCount: 2,
    exerciseTypesSeen: ['cloze'],
    bestProductionScore: null,
    recentAccuracy: 0.667,
    masteredAt: null,
    updatedAt: T1,
    ...override,
  };
}

/** The row with updatedAt blanked, which an adapter may set itself on a replace. */
function ignoringUpdatedAt(row: CandoMastery | null): CandoMastery | null {
  return row === null ? null : { ...row, updatedAt: '' };
}

function byCando(rows: CandoMastery[]): CandoMastery[] {
  return [...rows].sort((a, b) => a.candoId.localeCompare(b.candoId));
}

function outcome(
  correct: boolean,
  at: string,
  exerciseType: ExerciseTypeId = 'cloze',
): AttemptOutcome {
  return { correct, exerciseType, at };
}

/** `count` timestamps one second apart, starting at T1. */
function seconds(count: number): string[] {
  const start = Date.parse(T1);
  return Array.from({ length: count }, (_, i) => new Date(start + i * 1000).toISOString());
}

export function runMasteryStoreContract(
  name: string,
  makeHarness: () => MasteryStoreHarness | Promise<MasteryStoreHarness>,
): void {
  describe(`MasteryStore contract: ${name}`, () => {
    let store: MasteryStore;
    let newUserId: () => Promise<string>;
    let newCandoId: () => Promise<string>;

    beforeAll(async () => {
      const harness = await makeHarness();
      store = harness.store;
      newUserId = () => harness.newUserId();
      newCandoId = () => harness.newCandoId();
    });

    describe('getMastery and upsertMastery', () => {
      it('returns null for a descriptor without evidence', async () => {
        expect(await store.getMastery(await newUserId(), await newCandoId())).toBeNull();
      });

      it('stores a new row exactly as given', async () => {
        const row = masteryRow(await newUserId(), await newCandoId());

        await store.upsertMastery(row);

        expect(await store.getMastery(row.userId, row.candoId)).toEqual(row);
      });

      it('replaces every field of the row with the same user and descriptor', async () => {
        const first = masteryRow(await newUserId(), await newCandoId());
        const second = masteryRow(first.userId, first.candoId, {
          evidenceCount: 7,
          correctCount: 6,
          exerciseTypesSeen: ['cloze', 'dictation', 'multiple_choice'],
          bestProductionScore: 3.5,
          recentAccuracy: 0.8,
          masteredAt: T2,
          updatedAt: T2,
        });
        await store.upsertMastery(first);

        await store.upsertMastery(second);

        const stored = await store.getMastery(first.userId, first.candoId);
        expect(ignoringUpdatedAt(stored)).toEqual(ignoringUpdatedAt(second));
        expect(stored?.updatedAt).toMatch(ISO);
        expect(await store.listMastery(first.userId)).toHaveLength(1);
      });

      it('returns numbers, not strings, for the score and the accuracy', async () => {
        const row = masteryRow(await newUserId(), await newCandoId(), {
          bestProductionScore: 4.25,
          recentAccuracy: 0.9,
        });
        await store.upsertMastery(row);

        const stored = await store.getMastery(row.userId, row.candoId);

        expect(stored?.bestProductionScore).toBe(4.25);
        expect(stored?.recentAccuracy).toBe(0.9);
      });

      it('keeps null for a missing score, accuracy and mastery time, and an empty type list', async () => {
        const row = masteryRow(await newUserId(), await newCandoId(), {
          evidenceCount: 0,
          correctCount: 0,
          exerciseTypesSeen: [],
          bestProductionScore: null,
          recentAccuracy: null,
          masteredAt: null,
        });

        await store.upsertMastery(row);

        expect(await store.getMastery(row.userId, row.candoId)).toEqual(row);
      });

      it('can set a score and a mastery time back to null on a replace', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        await store.upsertMastery(
          masteryRow(userId, candoId, { bestProductionScore: 3, masteredAt: T1 }),
        );

        await store.upsertMastery(masteryRow(userId, candoId));

        const stored = await store.getMastery(userId, candoId);
        expect(stored?.bestProductionScore).toBeNull();
        expect(stored?.masteredAt).toBeNull();
      });

      it('hands out copies: changing a returned row does not change the stored one', async () => {
        const row = masteryRow(await newUserId(), await newCandoId());
        await store.upsertMastery(row);
        const held = await store.getMastery(row.userId, row.candoId);

        if (held) {
          held.evidenceCount = 99;
          held.exerciseTypesSeen.push('translate');
        }
        row.exerciseTypesSeen.push('dictation');

        const again = await store.getMastery(row.userId, row.candoId);
        expect(again?.evidenceCount).toBe(3);
        expect(again?.exerciseTypesSeen).toEqual(['cloze']);
      });
    });

    describe('listMastery', () => {
      it('is empty for a user without rows', async () => {
        expect(await store.listMastery(await newUserId())).toEqual([]);
      });

      it('returns every row of the user and no row of another user', async () => {
        const userA = await newUserId();
        const userB = await newUserId();
        const shared = await newCandoId();
        const rowsA = [
          masteryRow(userA, shared, { evidenceCount: 1 }),
          masteryRow(userA, await newCandoId(), { evidenceCount: 2 }),
          masteryRow(userA, await newCandoId(), { evidenceCount: 3 }),
        ];
        const rowB = masteryRow(userB, shared, { evidenceCount: 9, masteredAt: T3 });
        for (const row of [...rowsA, rowB]) await store.upsertMastery(row);

        expect(byCando(await store.listMastery(userA))).toEqual(byCando(rowsA));
        expect(await store.listMastery(userB)).toEqual([rowB]);
        // Same descriptor, two users: two independent rows.
        expect((await store.getMastery(userA, shared))?.evidenceCount).toBe(1);
        expect((await store.getMastery(userB, shared))?.evidenceCount).toBe(9);
      });

      it('returns the rows in the same order on every call', async () => {
        const userId = await newUserId();
        for (let i = 0; i < 4; i += 1) {
          await store.upsertMastery(masteryRow(userId, await newCandoId()));
        }

        const first = await store.listMastery(userId);
        const second = await store.listMastery(userId);

        expect(first).toHaveLength(4);
        expect(second.map((row) => row.candoId)).toEqual(first.map((row) => row.candoId));
      });
    });

    describe('appendAttemptOutcome and recentOutcomes', () => {
      it('is empty for a descriptor without attempts', async () => {
        expect(await store.recentOutcomes(await newUserId(), await newCandoId(), 10)).toEqual([]);
      });

      it('returns the attempts oldest first, with every field as given', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        const appended = [
          outcome(true, T1, 'cloze'),
          outcome(false, T2, 'dictation'),
          outcome(true, T3, 'multiple_choice'),
        ];

        for (const one of appended) await store.appendAttemptOutcome(userId, candoId, one);

        expect(await store.recentOutcomes(userId, candoId, 10)).toEqual(appended);
      });

      it('returns only the newest `limit` attempts, still oldest first', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        const appended = seconds(6).map((at, i) => outcome(i % 2 === 0, at));
        for (const one of appended) await store.appendAttemptOutcome(userId, candoId, one);

        expect(await store.recentOutcomes(userId, candoId, 4)).toEqual(appended.slice(-4));
        expect(await store.recentOutcomes(userId, candoId, 1)).toEqual(appended.slice(-1));
        expect(await store.recentOutcomes(userId, candoId, 6)).toEqual(appended);
      });

      it('keeps the append order of attempts that carry the same time', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        const flags = [true, false, false, true, true, false, true];
        for (const correct of flags) {
          await store.appendAttemptOutcome(userId, candoId, outcome(correct, T1));
        }

        const all = await store.recentOutcomes(userId, candoId, 10);
        const lastThree = await store.recentOutcomes(userId, candoId, 3);

        expect(all.map((one) => one.correct)).toEqual(flags);
        expect(all.map((one) => one.at)).toEqual(flags.map(() => T1));
        expect(lastThree.map((one) => one.correct)).toEqual(flags.slice(-3));
      });

      it('keeps the append order when a later attempt carries an earlier time', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        await store.appendAttemptOutcome(userId, candoId, outcome(true, T2, 'cloze'));
        await store.appendAttemptOutcome(userId, candoId, outcome(false, T1, 'dictation'));
        await store.appendAttemptOutcome(userId, candoId, outcome(true, T3, 'translate'));

        const all = await store.recentOutcomes(userId, candoId, 10);

        expect(all.map((one) => one.exerciseType)).toEqual(['cloze', 'dictation', 'translate']);
        expect(all.map((one) => one.correct)).toEqual([true, false, true]);
      });

      it.each([0, -1, 1.5, Number.NaN])('is empty for a limit of %s', async (limit) => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        await store.appendAttemptOutcome(userId, candoId, outcome(true, T1));

        expect(await store.recentOutcomes(userId, candoId, limit)).toEqual([]);
      });

      it('keeps the histories of two users and two descriptors apart', async () => {
        const userA = await newUserId();
        const userB = await newUserId();
        const candoX = await newCandoId();
        const candoY = await newCandoId();
        await store.appendAttemptOutcome(userA, candoX, outcome(true, T1));
        await store.appendAttemptOutcome(userA, candoY, outcome(false, T2));
        await store.appendAttemptOutcome(userB, candoX, outcome(false, T3));

        expect(await store.recentOutcomes(userA, candoX, 10)).toEqual([outcome(true, T1)]);
        expect(await store.recentOutcomes(userA, candoY, 10)).toEqual([outcome(false, T2)]);
        expect(await store.recentOutcomes(userB, candoX, 10)).toEqual([outcome(false, T3)]);
        expect(await store.recentOutcomes(userB, candoY, 10)).toEqual([]);
      });

      it(`never returns more than the newest ${OUTCOME_HISTORY_LIMIT} attempts`, async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        const appended = seconds(OUTCOME_HISTORY_LIMIT + 3).map((at, i) =>
          outcome(i % 3 !== 0, at),
        );
        for (const one of appended) await store.appendAttemptOutcome(userId, candoId, one);

        const read = await store.recentOutcomes(userId, candoId, OUTCOME_HISTORY_LIMIT + 10);

        expect(read).toEqual(appended.slice(-OUTCOME_HISTORY_LIMIT));
      });

      it('hands out copies of the attempts', async () => {
        const userId = await newUserId();
        const candoId = await newCandoId();
        await store.appendAttemptOutcome(userId, candoId, outcome(true, T1));
        const held = await store.recentOutcomes(userId, candoId, 10);

        if (held[0]) held[0].correct = false;

        expect(await store.recentOutcomes(userId, candoId, 10)).toEqual([outcome(true, T1)]);
      });
    });

    function estimate(userId: string, override: Partial<LevelEstimate> = {}): LevelEstimate {
      return {
        userId,
        languageCode: 'de',
        level: 'A2',
        confidence: 0.625,
        method: 'placement',
        createdAt: T1,
        ...override,
      };
    }

    describe('insertEstimate, latestEstimate and listEstimates', () => {
      it('has no estimate for a user without one', async () => {
        const userId = await newUserId();

        expect(await store.latestEstimate(userId, 'de')).toBeNull();
        expect(await store.listEstimates(userId, 'de')).toEqual([]);
      });

      it('appends: the list keeps every estimate in order and latest is the last one', async () => {
        const userId = await newUserId();
        const appended = [
          estimate(userId, { level: 'A1', confidence: 0, method: 'placement', createdAt: T1 }),
          estimate(userId, { level: 'B1', confidence: 1, method: 'checkpoint', createdAt: T2 }),
          estimate(userId, { level: 'A2', confidence: 0.5, method: 'manual', createdAt: T3 }),
        ];

        for (const one of appended) await store.insertEstimate(one);

        expect(await store.listEstimates(userId, 'de')).toEqual(appended);
        expect(await store.latestEstimate(userId, 'de')).toEqual(appended[2]);
      });

      it('an identical estimate appended twice is stored twice', async () => {
        const userId = await newUserId();
        const one = estimate(userId, { method: 'mastery_ratio' });

        await store.insertEstimate(one);
        await store.insertEstimate(one);

        expect(await store.listEstimates(userId, 'de')).toEqual([one, one]);
      });

      it('keeps the append order of estimates that carry the same time', async () => {
        const userId = await newUserId();
        const levels = ['A1', 'B2', 'A2', 'C1', 'B1'] as const;
        for (const level of levels) await store.insertEstimate(estimate(userId, { level }));

        const listed = await store.listEstimates(userId, 'de');

        expect(listed.map((row) => row.level)).toEqual(levels);
        expect(listed.map((row) => row.createdAt)).toEqual(levels.map(() => T1));
        expect((await store.latestEstimate(userId, 'de'))?.level).toBe('B1');
      });

      it('latest is the one appended last, even when it carries an earlier time', async () => {
        const userId = await newUserId();
        await store.insertEstimate(estimate(userId, { level: 'B1', createdAt: T2 }));
        await store.insertEstimate(estimate(userId, { level: 'A2', createdAt: T1 }));

        expect((await store.latestEstimate(userId, 'de'))?.level).toBe('A2');
        expect((await store.listEstimates(userId, 'de')).map((row) => row.level)).toEqual([
          'B1',
          'A2',
        ]);
      });

      it('keeps the estimates of two languages and two users apart', async () => {
        const userA = await newUserId();
        const userB = await newUserId();
        const de = estimate(userA, { languageCode: 'de', level: 'B1' });
        const nl = estimate(userA, { languageCode: 'nl', level: 'A1' });
        const other = estimate(userB, { languageCode: 'de', level: 'C1' });
        for (const one of [de, nl, other]) await store.insertEstimate(one);

        expect(await store.listEstimates(userA, 'de')).toEqual([de]);
        expect(await store.listEstimates(userA, 'nl')).toEqual([nl]);
        expect(await store.latestEstimate(userA, 'fr')).toBeNull();
        expect(await store.latestEstimate(userB, 'de')).toEqual(other);
      });
    });

    function streakOf(userId: string, override: Partial<Streak> = {}): Streak {
      return {
        userId,
        languageCode: 'de',
        currentDays: 3,
        longestDays: 5,
        lastActiveDate: '2026-11-05',
        ...override,
      };
    }

    describe('getStreak and upsertStreak', () => {
      it('returns null for a user without a streak', async () => {
        expect(await store.getStreak(await newUserId(), 'de')).toBeNull();
      });

      it('stores a new row exactly as given', async () => {
        const row = streakOf(await newUserId());

        await store.upsertStreak(row);

        expect(await store.getStreak(row.userId, 'de')).toEqual(row);
      });

      it('replaces the row with the same user and language', async () => {
        const userId = await newUserId();
        await store.upsertStreak(streakOf(userId));
        const next = streakOf(userId, {
          currentDays: 1,
          longestDays: 5,
          lastActiveDate: '2026-11-09',
        });

        await store.upsertStreak(next);

        expect(await store.getStreak(userId, 'de')).toEqual(next);
      });

      // The first and last day of a year and a leap day: a date that passed
      // through a Date in a time zone away from UTC would come back a day off.
      it.each(['2026-01-01', '2026-12-31', '2024-02-29', '2026-03-29', '2026-10-25'])(
        'returns the day %s as the same plain string',
        async (day) => {
          const row = streakOf(await newUserId(), { lastActiveDate: day });

          await store.upsertStreak(row);

          expect((await store.getStreak(row.userId, 'de'))?.lastActiveDate).toBe(day);
        },
      );

      it('keeps a null last active day, and can set a day back to null', async () => {
        const userId = await newUserId();
        const empty = streakOf(userId, { currentDays: 0, longestDays: 0, lastActiveDate: null });

        await store.upsertStreak(empty);
        expect(await store.getStreak(userId, 'de')).toEqual(empty);

        await store.upsertStreak(streakOf(userId));
        await store.upsertStreak(empty);
        expect(await store.getStreak(userId, 'de')).toEqual(empty);
      });

      it('keeps the streaks of two languages and two users apart', async () => {
        const userA = await newUserId();
        const userB = await newUserId();
        const de = streakOf(userA, { languageCode: 'de', currentDays: 4 });
        const nl = streakOf(userA, { languageCode: 'nl', currentDays: 1, longestDays: 1 });
        const other = streakOf(userB, { languageCode: 'de', currentDays: 2 });
        for (const one of [de, nl, other]) await store.upsertStreak(one);

        expect(await store.getStreak(userA, 'de')).toEqual(de);
        expect(await store.getStreak(userA, 'nl')).toEqual(nl);
        expect(await store.getStreak(userA, 'fr')).toBeNull();
        expect(await store.getStreak(userB, 'de')).toEqual(other);
      });

      it('hands out copies of the streak', async () => {
        const row = streakOf(await newUserId());
        await store.upsertStreak(row);
        const held = await store.getStreak(row.userId, 'de');

        if (held) held.currentDays = 99;

        expect((await store.getStreak(row.userId, 'de'))?.currentDays).toBe(3);
      });
    });
  });
}
