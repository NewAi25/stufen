// Integration test for the Postgres adapter (P1-35). Needs a real PostgreSQL
// with the migrations applied and is skipped when DATABASE_URL is not set.
// See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-feedback test
//
// It creates its own users and feedback rows and deletes exactly those again
// at the end. Other tests may use the same database at the same time, so no
// check here counts or deletes rows it did not create.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { FeedbackItem } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createFeedback, createPostgresFeedbackStore, FeedbackValidationError } from '../src/index';
import type { FeedbackStore } from '../src/index';
import { runFeedbackStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createPostgresFeedbackStore on a real Postgres', () => {
  let db: Database;
  const createdUsers: string[] = [];
  const createdFeedback = new Set<string>();

  beforeAll(() => {
    db = createDb(url as string);
  });

  afterAll(async () => {
    // Feedback first: deleting a user only sets feedback.user_id to null.
    if (createdFeedback.size > 0) {
      await db
        .deleteFrom('feedback')
        .where('id', 'in', [...createdFeedback])
        .execute();
    }
    // profiles and entitlements go with the users (on delete cascade).
    if (createdUsers.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    }
    await db.destroy();
  });

  /** Owner work, the way core-auth creates a user at sign up. */
  async function makeUser(): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p135-${id}@example.test`, name: 'Feedback Test' })
      .execute();
    await sql`select ensure_profile(${id}::uuid)`.execute(db);
    return id;
  }

  /** The store under test. Notes every id it is asked to insert, for afterAll. */
  function makeStore(): FeedbackStore {
    const store = createPostgresFeedbackStore(db);
    return {
      ...store,
      insert(item: FeedbackItem) {
        createdFeedback.add(item.id);
        return store.insert(item);
      },
    };
  }

  function makeItem(override: Partial<FeedbackItem> = {}): FeedbackItem {
    return {
      id: randomUUID(),
      userId: null,
      kind: 'idea',
      page: '/home',
      message: 'Add a dark theme.',
      rating: null,
      context: null,
      status: 'new',
      createdAt: '2026-11-06T12:00:00.000Z',
      ...override,
    };
  }

  /** The row as the owner sees it, straight from the table. */
  const rawRow = (id: string) =>
    db.selectFrom('feedback').selectAll().where('id', '=', id).executeTakeFirst();

  runFeedbackStoreContract('Postgres', makeStore, makeUser);

  describe('row level security', () => {
    it('a select inside withUser(A) returns only the rows of A', async () => {
      const store = makeStore();
      const userA = await makeUser();
      const userB = await makeUser();
      const ofA = makeItem({ userId: userA });
      const ofB = makeItem({ userId: userB });
      const anonymous = makeItem({ userId: null });
      for (const item of [ofA, ofB, anonymous]) await store.insert(item);

      // No where clause: the policy feedback_own_select is the only filter.
      const seenByA = await withUser(db, userA, (trx) =>
        trx.selectFrom('feedback').select(['id', 'user_id']).execute(),
      );
      expect(seenByA).toEqual([{ id: ofA.id, user_id: userA }]);

      // Asking for the row of B by id, or for B's rows by user id, finds nothing.
      const reachForB = await withUser(db, userA, (trx) =>
        trx
          .selectFrom('feedback')
          .select('id')
          .where((eb) => eb.or([eb('id', '=', ofB.id), eb('user_id', '=', userB)]))
          .execute(),
      );
      expect(reachForB).toEqual([]);

      const seenByB = await withUser(db, userB, (trx) =>
        trx.selectFrom('feedback').select(['id', 'user_id']).execute(),
      );
      expect(seenByB).toEqual([{ id: ofB.id, user_id: userB }]);
    });

    it('a signed out select returns no rows, not even the anonymous ones', async () => {
      const store = makeStore();
      await store.insert(makeItem({ userId: null }));

      const seen = await withUser(db, null, (trx) =>
        trx.selectFrom('feedback').select('id').execute(),
      );

      expect(seen).toEqual([]);
    });

    it('a signed out insert succeeds and is stored without a user', async () => {
      const store = makeStore();
      const item = makeItem({ userId: null, kind: 'bug', message: 'Sign in page is blank.' });

      await store.insert(item);

      const row = await rawRow(item.id);
      expect(row).toMatchObject({ id: item.id, user_id: null, kind: 'bug', status: 'new' });
      expect(row?.created_at.toISOString()).toBe(item.createdAt);
    });

    it('the database refuses an insert in the name of another user', async () => {
      const userA = await makeUser();
      const userB = await makeUser();
      const id = randomUUID();
      createdFeedback.add(id);

      const forged = withUser(db, userA, (trx) =>
        trx
          .insertInto('feedback')
          .values({ id, user_id: userB, kind: 'other', message: 'forged' })
          .execute(),
      );

      await expect(forged).rejects.toMatchObject({ code: '42501' });
      expect(await rawRow(id)).toBeUndefined();
    });

    it('a learner cannot change or delete feedback, not even the own row', async () => {
      const store = makeStore();
      const userA = await makeUser();
      const item = makeItem({ userId: userA });
      await store.insert(item);

      const [updated, deleted] = await withUser(db, userA, async (trx) => {
        const update = await trx
          .updateTable('feedback')
          .set({ status: 'done' })
          .where('id', '=', item.id)
          .executeTakeFirst();
        const remove = await trx
          .deleteFrom('feedback')
          .where('id', '=', item.id)
          .executeTakeFirst();
        return [update.numUpdatedRows, remove.numDeletedRows];
      });

      expect([updated, deleted]).toEqual([0n, 0n]);
      expect(await rawRow(item.id)).toMatchObject({ status: 'new' });
    });
  });

  describe('the createFeedback facade on the Postgres store', () => {
    function setup() {
      const bus = createEventBus();
      const submitted = vi.fn(async () => {});
      bus.on('feedback.submitted', submitted);
      const ids: string[] = [];
      let time = Date.parse('2026-11-06T15:00:00.000Z');
      const feedback = createFeedback({
        store: makeStore(),
        bus,
        // One minute later on every submit, so the order is known.
        now: () => new Date((time += 60_000)),
        newId: () => {
          const id = randomUUID();
          ids.push(id);
          return id;
        },
      });
      return { feedback, submitted, ids };
    }

    it('acceptance: an anonymous submit inserts a feedback row and emits feedback.submitted', async () => {
      const { feedback, submitted, ids } = setup();

      await feedback.submit({ kind: 'idea', page: '/home', message: '  Add a dark theme.  ' });

      const [id] = ids;
      if (!id) throw new Error('expected one id');
      expect(await rawRow(id)).toMatchObject({
        id,
        user_id: null,
        kind: 'idea',
        page: '/home',
        message: 'Add a dark theme.',
        rating: null,
        context: {},
        status: 'new',
      });
      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted).toHaveBeenCalledWith({ feedbackId: id, kind: 'idea' });
    });

    it("acceptance: listMine returns only the caller's rows, newest first", async () => {
      const { feedback, submitted, ids } = setup();
      const userA = await makeUser();
      const userB = await makeUser();

      await feedback.submit({ userId: userA, kind: 'bug', message: 'First from A.' });
      await feedback.submit({ userId: userB, kind: 'confusing', message: 'From B.' });
      await feedback.submit({ kind: 'other', message: 'From nobody.' });
      await feedback.submit({
        userId: userA,
        kind: 'rating',
        message: '',
        rating: 5,
        context: { lessonId: 'a1-01', device: { width: 390 } },
      });

      const mineA = await feedback.listMine(userA);
      expect(mineA.map((row) => row.id)).toEqual([ids[3], ids[0]]);
      expect(mineA[0]).toEqual<FeedbackItem>({
        id: ids[3] ?? '',
        userId: userA,
        kind: 'rating',
        page: '',
        message: '',
        rating: 5,
        context: { lessonId: 'a1-01', device: { width: 390 } },
        status: 'new',
        createdAt: '2026-11-06T15:04:00.000Z',
      });
      expect((await feedback.listMine(userB)).map((row) => row.id)).toEqual([ids[1]]);
      expect(await feedback.listMine('')).toEqual([]);
      expect(submitted).toHaveBeenCalledTimes(4);
    });

    it('a rejected submit stores nothing and emits nothing', async () => {
      const { feedback, submitted, ids } = setup();
      const userId = await makeUser();

      const attempt = feedback.submit({ userId, kind: 'bug', message: '   ' });

      await expect(attempt).rejects.toBeInstanceOf(FeedbackValidationError);
      await expect(attempt).rejects.toMatchObject({ field: 'message' });
      expect(ids).toEqual([]);
      expect(await feedback.listMine(userId)).toEqual([]);
      expect(submitted).not.toHaveBeenCalled();
    });

    it('setStatus updates the row, returns null for an unknown id and checks the status', async () => {
      const { feedback, ids } = setup();
      const userId = await makeUser();
      await feedback.submit({ userId, kind: 'bug', message: 'Broken link.' });
      const [id] = ids;
      if (!id) throw new Error('expected one id');

      expect(await feedback.setStatus(id, 'planned')).toMatchObject({ id, status: 'planned' });
      expect(await feedback.listMine(userId)).toMatchObject([{ id, status: 'planned' }]);
      expect(await feedback.setStatus(randomUUID(), 'done')).toBeNull();
      await expect(feedback.setStatus(id, 'archived' as 'done')).rejects.toMatchObject({
        field: 'status',
      });
      expect(await rawRow(id)).toMatchObject({ status: 'planned' });
    });
  });

  describe('what is specific to the Postgres adapter', () => {
    it('an empty context reads back as null, and a null page reads back as an empty string', async () => {
      const store = makeStore();
      const userId = await makeUser();
      const emptyContext = makeItem({ userId, context: {}, createdAt: '2026-11-06T12:00:01.000Z' });
      await store.insert(emptyContext);
      // A row written by other means, with the column defaults and no page.
      const bare = randomUUID();
      createdFeedback.add(bare);
      await db
        .insertInto('feedback')
        .values({ id: bare, user_id: userId, kind: 'other', message: 'bare row' })
        .execute();
      await db
        .updateTable('feedback')
        .set({ created_at: '2026-11-06T12:00:00.000Z' })
        .where('id', '=', bare)
        .execute();

      const rows = await store.listByUser(userId);

      expect(rows).toEqual<FeedbackItem[]>([
        { ...emptyContext, context: null },
        {
          id: bare,
          userId,
          kind: 'other',
          page: '',
          message: 'bare row',
          rating: null,
          context: null,
          status: 'new',
          createdAt: '2026-11-06T12:00:00.000Z',
        },
      ]);
    });

    it('rows with the same createdAt come back in descending id order', async () => {
      const store = makeStore();
      const userId = await makeUser();
      const items = [makeItem({ userId }), makeItem({ userId }), makeItem({ userId })];
      for (const item of items) await store.insert(item);

      const ids = (await store.listByUser(userId)).map((row) => row.id);

      expect(ids).toEqual(
        items
          .map((item) => item.id)
          .sort()
          .reverse(),
      );
    });

    it('insert rejects an id or a userId that is not a uuid, before any query', async () => {
      const store = createPostgresFeedbackStore(db);

      await expect(store.insert(makeItem({ id: 'fb-1' }))).rejects.toBeInstanceOf(TypeError);
      await expect(store.insert(makeItem({ userId: 'user-1' }))).rejects.toBeInstanceOf(TypeError);
      await expect(store.insert(makeItem({ rating: 6 }))).rejects.toBeInstanceOf(TypeError);
      expect(await store.listByUser('user-1')).toEqual([]);
    });

    it('insert rejects a userId that has no profile', async () => {
      const store = makeStore();
      const item = makeItem({ userId: randomUUID() });

      // 23503 foreign_key_violation: feedback.user_id references profiles(id).
      await expect(store.insert(item)).rejects.toMatchObject({ code: '23503' });
      expect(await rawRow(item.id)).toBeUndefined();
    });

    it('deleting a user keeps the feedback and turns it anonymous', async () => {
      const store = makeStore();
      const userId = await makeUser();
      const item = makeItem({ userId, message: 'Written before the account was deleted.' });
      await store.insert(item);

      // Owner work, the way account deletion removes the users row.
      await db.deleteFrom('users').where('id', '=', userId).execute();

      expect(await rawRow(item.id)).toMatchObject({ id: item.id, user_id: null });
      expect(await store.listByUser(userId)).toEqual([]);
      const all = await store.listAll({ kind: 'idea' });
      expect(all.find((row) => row.id === item.id)).toEqual({ ...item, userId: null });
    });
  });
});
