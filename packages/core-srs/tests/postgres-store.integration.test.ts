// Integration test for the Postgres adapter. Needs a real PostgreSQL with the
// migrations applied and is skipped when DATABASE_URL is not set. See "How to
// test it" in the README.
//
//   DATABASE_URL=postgres://stufen@localhost:5497/stufen_srs pnpm --filter @stufen/core-srs test
//
// As the owner it creates its own rows in `users` (then ensure_profile, the
// way core-auth does at sign up) and its own rows in `items`, and deletes
// exactly those rows at the end. The deletes cascade to profiles,
// entitlements, review_cards and review_logs. Nothing else is changed.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { EventMap, LanguageCode, ReviewRating } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createInMemoryCardStore, createPostgresCardStore, createSrs } from '../src/index';
import type { CardStore, StoredReviewCard } from '../src/index';
import {
  insertLogRow,
  selectCard,
  selectDueCards,
  selectLogs,
  upsertCardRow,
} from '../src/postgres-store';
import { runCardStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

const START = Date.parse('2026-11-11T09:00:00.000Z');
const MINUTE = 60 * 1000;

describe.skipIf(!url)('Postgres CardStore on a real Postgres', () => {
  const createdUsers: string[] = [];
  const createdItems: string[] = [];
  let db: Database;
  let store: CardStore;

  /** A row in `users` and, through ensure_profile, in `profiles`. Both as owner. */
  async function newUser(): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p130-${id}@example.test`, name: null })
      .execute();
    await sql`select ensure_profile(${id}::uuid)`.execute(db);
    return id;
  }

  /** A row in `items` in this language, inserted as owner. */
  async function newItem(language: LanguageCode): Promise<string> {
    const id = randomUUID();
    createdItems.push(id);
    await db
      .insertInto('items')
      .values({
        id,
        language_code: language,
        kind: 'vocab',
        key: `${language}:vocab:p130-${id}`,
        lemma: `p130-${id}`,
        gloss_en: 'test item',
        level: 'A1',
        pack_version: 'p130-test',
      })
      .execute();
    return id;
  }

  beforeAll(() => {
    db = createDb(url as string);
    store = createPostgresCardStore(db);
  });

  afterAll(async () => {
    // Users first: that removes their profiles, cards and logs. Then the items.
    if (createdUsers.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    }
    if (createdItems.length > 0) {
      await db.deleteFrom('items').where('id', 'in', createdItems).execute();
    }
    await db.destroy();
  });

  runCardStoreContract('Postgres', () => ({ store, newUserId: newUser, newItemId: newItem }));

  /** A scheduler on the Postgres store with a clock the test controls. */
  function setup(cardStore: CardStore = store) {
    const bus = createEventBus({ onError: () => {} });
    const reviewed: EventMap['item.reviewed'][] = [];
    bus.on('item.reviewed', async (payload) => {
      reviewed.push(payload);
    });
    const errors: unknown[] = [];
    let time = START;
    const srs = createSrs({
      store: cardStore,
      bus,
      now: () => new Date(time),
      onError: (error) => errors.push(error),
    });
    return {
      srs,
      bus,
      reviewed,
      errors,
      goTo(card: StoredReviewCard) {
        time = Date.parse(card.due);
      },
    };
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

  describe('createSrs on the Postgres store', () => {
    it('introduceItems creates one new card, due at once, in the language of the item', async () => {
      const userId = await newUser();
      const itemId = await newItem('nl');
      const { srs } = setup();

      await srs.introduceItems(userId, 'nl', [itemId]);
      await srs.introduceItems(userId, 'nl', [itemId, itemId]);

      const card: StoredReviewCard = {
        userId,
        itemId,
        language: 'nl',
        stability: 0,
        difficulty: 0,
        due: new Date(START).toISOString(),
        lastReview: null,
        reps: 0,
        lapses: 0,
        state: 'new',
        scheduledDays: 0,
        learningSteps: 0,
      };
      expect(await store.getCard(userId, itemId)).toEqual(card);
      expect(await srs.dueQueue(userId, 'nl')).toEqual([card]);
      expect(await srs.dueQueue(userId, 'fr')).toEqual([]);
      expect(await srs.stats(userId, 'nl')).toEqual({ due: 1, learning: 0, mature: 0 });
    });

    it('good twice moves due forward and the scheduler state survives a fresh store', async () => {
      const userId = await newUser();
      const itemId = await newItem('nl');
      const first = setup();
      await first.srs.introduceItems(userId, 'nl', [itemId]);

      const afterFirst = await first.srs.review(userId, itemId, 3);

      // A second handle with its own connections: nothing is shared in memory.
      const otherDb = createDb(url as string);
      try {
        const freshStore = createPostgresCardStore(otherDb);
        // The first good puts the card on a short step, which must be stored.
        expect(afterFirst).toMatchObject({ state: 'learning', reps: 1, scheduledDays: 0 });
        expect(afterFirst.learningSteps).toBeGreaterThan(0);
        expect(Date.parse(afterFirst.due)).toBeGreaterThan(START);
        expect(await freshStore.getCard(userId, itemId)).toEqual(afterFirst);

        // The second review runs on the fresh store, so everything ts-fsrs
        // gets back for it was read from the database.
        const second = setup(freshStore);
        second.goTo(afterFirst);
        const afterSecond = await second.srs.review(userId, itemId, 3);

        expect(afterSecond).toMatchObject({ state: 'review', reps: 2, learningSteps: 0 });
        expect(afterSecond.scheduledDays).toBeGreaterThan(0);
        expect(Date.parse(afterSecond.due)).toBeGreaterThan(Date.parse(afterFirst.due));
        expect(afterSecond.lastReview).toBe(afterFirst.due);
        expect(await store.getCard(userId, itemId)).toEqual(afterSecond);
        expect(await second.srs.dueQueue(userId, 'nl')).toEqual([]);

        const logs = await store.listLogs(userId, itemId);
        expect(logs).toMatchObject([
          { userId, itemId, rating: 3, stateBefore: 'new', elapsedDays: 0, scheduledDays: 0 },
          { userId, itemId, rating: 3, stateBefore: 'learning', scheduledDays: 0 },
        ]);
        expect(logs.map((log) => log.reviewedAt)).toEqual([
          new Date(START).toISOString(),
          afterFirst.due,
        ]);
        const stepDays = (Date.parse(afterFirst.due) - START) / (24 * 60 * MINUTE);
        expect(logs[1]?.elapsedDays).toBe(stepDays);
        expect([...first.reviewed, ...second.reviewed]).toEqual([
          { userId, itemId, rating: 3 },
          { userId, itemId, rating: 3 },
        ]);
      } finally {
        await otherDb.destroy();
      }
    });
  });

  describe('the attempt.recorded subscription on the Postgres store', () => {
    function attempt(
      userId: string,
      itemIds: string[],
      language: LanguageCode,
    ): EventMap['attempt.recorded'] {
      return {
        userId,
        attemptId: randomUUID(),
        exerciseType: 'cloze',
        correct: true,
        score: 1,
        candoIds: [],
        itemIds,
        language,
      };
    }

    it('an attempt with one item id creates a card and rates it', async () => {
      const userId = await newUser();
      const itemId = await newItem('fr');
      const { srs, bus, reviewed, errors } = setup();
      const detach = srs.attach();

      await bus.emit('attempt.recorded', attempt(userId, [itemId], 'fr'));
      detach();

      expect(errors).toEqual([]);
      const card = await store.getCard(userId, itemId);
      expect(card).toMatchObject({ userId, itemId, language: 'fr', state: 'learning', reps: 1 });
      expect(Date.parse(card?.due ?? '')).toBeGreaterThan(START);
      expect(await store.listLogs(userId, itemId)).toMatchObject([
        { rating: 3, stateBefore: 'new', reviewedAt: new Date(START).toISOString() },
      ]);
      expect(reviewed).toEqual([{ userId, itemId, rating: 3 }]);
    });

    it('an item id that is not in items is reported and stores nothing', async () => {
      const userId = await newUser();
      const known = await newItem('nl');
      const unknown = randomUUID();
      const { srs, bus, errors } = setup();
      srs.attach();

      await bus.emit('attempt.recorded', attempt(userId, [unknown, known], 'nl'));

      // 23503 foreign_key_violation on review_cards.item_id. The other item is still handled.
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ code: '23503' });
      expect(await store.getCard(userId, unknown)).toBeNull();
      expect(await store.getCard(userId, known)).toMatchObject({ state: 'learning', reps: 1 });
    });
  });

  describe('what only the Postgres adapter does', () => {
    it('takes the language from the item, not from the card that was written', async () => {
      const userId = await newUser();
      const itemId = await newItem('fr');
      const { srs } = setup();

      // The caller says Dutch; the item is French.
      await srs.introduceItems(userId, 'nl', [itemId]);

      expect((await store.getCard(userId, itemId))?.language).toBe('fr');
      expect(await srs.dueQueue(userId, 'nl')).toEqual([]);
      expect(await srs.dueQueue(userId, 'fr')).toHaveLength(1);
    });

    it('gives exactly the same cards and logs as the in memory store for the same reviews', async () => {
      const userId = await newUser();
      const itemId = await newItem('nl');
      const ratings: ReviewRating[] = [3, 3, 1, 3, 4, 2];

      /** Introduces the item, then gives each rating at the moment the card comes due. */
      async function run(cardStore: CardStore) {
        const { srs, goTo } = setup(cardStore);
        await srs.introduceItems(userId, 'nl', [itemId]);
        const cards: StoredReviewCard[] = [];
        for (const rating of ratings) {
          const card = await srs.review(userId, itemId, rating);
          cards.push(card);
          goTo(card);
        }
        return {
          cards,
          stored: await cardStore.getCard(userId, itemId),
          logs: await cardStore.listLogs(userId, itemId),
        };
      }

      const inMemory = await run(createInMemoryCardStore());
      const inPostgres = await run(store);

      // toEqual compares numbers exactly. Every review reads the card back
      // from the database first, so one rounded digit anywhere would show up
      // in the cards that follow.
      expect(inPostgres).toEqual(inMemory);
      expect(inPostgres.stored).toEqual(inPostgres.cards.at(-1));
      expect(inPostgres.logs).toHaveLength(ratings.length);
      // The run is a real test of precision: these numbers do not fit a 4
      // byte float, which is what the columns were before migration 0006.
      const fitsFloat4 = (value: number): boolean => Math.fround(value) === value;
      expect(inPostgres.cards.every((card) => fitsFloat4(card.stability))).toBe(false);
      expect(inPostgres.logs.every((log) => fitsFloat4(log.elapsedDays))).toBe(false);
    });

    it('rejects a user id that is not a uuid before any query runs', async () => {
      await expect(store.getCard('user-1', randomUUID())).rejects.toThrow(TypeError);
    });
  });

  // The port has no separate "who is asking": every method acts for the user
  // id it is given. So the cross user checks run the adapter's own statements,
  // and plain selects with no filter, inside user B's transaction.
  describe('row security: user B against user A', () => {
    const LATER = new Date(START + 400 * 24 * 60 * MINUTE);

    /** User A with one reviewed card, and user B with nothing. */
    async function twoUsers() {
      const a = await newUser();
      const b = await newUser();
      const itemId = await newItem('nl');
      const { srs } = setup();
      await srs.introduceItems(a, 'nl', [itemId]);
      const card = await srs.review(a, itemId, 3);
      return { a, b, itemId, card };
    }

    it("B cannot see A's cards or logs", async () => {
      const { a, b, itemId } = await twoUsers();

      const seenByB = await withUser(db, b, async (trx) => ({
        card: await selectCard(trx, a, itemId),
        due: await selectDueCards(trx, a, 'nl', LATER, 10),
        logs: await selectLogs(trx, a, itemId),
        // No where clause: everything the policies let B read.
        cardRows: await trx.selectFrom('review_cards').select(['user_id', 'item_id']).execute(),
        logRows: await trx.selectFrom('review_logs').select(['user_id', 'item_id']).execute(),
      }));
      // The same two selects as A find the rows, so the empty results above
      // come from the policies and not from the queries.
      const seenByA = await withUser(db, a, async (trx) => ({
        cardRows: await trx.selectFrom('review_cards').select(['user_id', 'item_id']).execute(),
        logRows: await trx.selectFrom('review_logs').select(['user_id', 'item_id']).execute(),
      }));

      expect(seenByB).toEqual({ card: null, due: [], logs: [], cardRows: [], logRows: [] });
      expect(seenByA).toEqual({
        cardRows: [{ user_id: a, item_id: itemId }],
        logRows: [{ user_id: a, item_id: itemId }],
      });
    });

    it("B cannot write a card or a log for A, and cannot change A's card", async () => {
      const { a, b, itemId, card } = await twoUsers();
      const otherItem = await newItem('nl');

      // 42501 is insufficient_privilege: the row level security policy refused the row.
      const overwrite = await errorCodeOf(
        withUser(db, b, (trx) => upsertCardRow(trx, { ...card, reps: 99, state: 'review' })),
      );
      const insertNew = await errorCodeOf(
        withUser(db, b, (trx) => upsertCardRow(trx, { ...card, itemId: otherItem })),
      );
      const log = await errorCodeOf(
        withUser(db, b, (trx) =>
          insertLogRow(trx, {
            userId: a,
            itemId,
            rating: 1,
            reviewedAt: LATER.toISOString(),
            elapsedDays: 1,
            scheduledDays: 1,
            stateBefore: 'review',
          }),
        ),
      );
      const updated = await withUser(db, b, (trx) =>
        trx
          .updateTable('review_cards')
          .set({ reps: 99 })
          .where('user_id', '=', a)
          .returning('item_id')
          .execute(),
      );

      expect({ overwrite, insertNew, log }).toEqual({
        overwrite: '42501',
        insertNew: '42501',
        log: '42501',
      });
      expect(updated).toEqual([]);
      expect(await store.getCard(a, itemId)).toEqual(card);
      expect(await store.getCard(a, otherItem)).toBeNull();
      expect(await store.listLogs(a, itemId)).toHaveLength(1);
    });

    it('with nobody signed in no card and no log is visible', async () => {
      await twoUsers();

      const seen = await withUser(db, null, async (trx) => ({
        cards: await trx.selectFrom('review_cards').select('user_id').execute(),
        logs: await trx.selectFrom('review_logs').select('user_id').execute(),
      }));

      expect(seen).toEqual({ cards: [], logs: [] });
    });
  });
});
