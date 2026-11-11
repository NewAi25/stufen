// The behaviour every FeedbackStore adapter shares. Not a test file itself:
// each adapter's test calls runFeedbackStoreContract with a way to make a
// store and a way to make a user id.
//
// The checks only look at rows they inserted themselves, so they also hold on
// a database that other tests write to at the same time. Ids are uuids,
// because the Postgres adapter accepts nothing else.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@stufen/contracts';
import type { FeedbackStore } from '../src/index';

type MaybePromise<T> = T | Promise<T>;

const START = Date.parse('2026-11-06T09:00:00.000Z');

/** A valid row. `minutes` moves createdAt forward from a fixed start. */
function makeItem(minutes: number, override: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: randomUUID(),
    userId: null,
    kind: 'bug',
    page: '/learn/de/lesson/a1-01',
    message: 'The audio button does nothing.',
    rating: null,
    context: null,
    status: 'new',
    createdAt: new Date(START + minutes * 60_000).toISOString(),
    ...override,
  };
}

/**
 * @param name        shown in the report, for example 'in memory' or 'Postgres'
 * @param makeStore   the store under test; called once per test
 * @param makeUserId  a user id the store accepts as the owner of a row; called
 *                    whenever a test needs a new user
 */
export function runFeedbackStoreContract(
  name: string,
  makeStore: () => MaybePromise<FeedbackStore>,
  makeUserId: () => MaybePromise<string>,
): void {
  describe(`FeedbackStore contract: ${name}`, () => {
    it('insert then listByUser returns the row unchanged', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const item = makeItem(0, {
        userId,
        kind: 'rating',
        message: '',
        rating: 4,
        context: { level: 'A1', nested: { tries: 2, tags: ['audio', 'ios'] } },
      });

      await store.insert(item);

      expect(await store.listByUser(userId)).toEqual([item]);
    });

    it('a row without page text, rating or context comes back the same', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const item = makeItem(0, { userId, page: '', rating: null, context: null });

      await store.insert(item);

      expect(await store.listByUser(userId)).toEqual([item]);
    });

    it('listByUser returns newest first, whatever the insert order', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const middle = makeItem(10, { userId });
      const newest = makeItem(20, { userId });
      const oldest = makeItem(0, { userId });
      for (const item of [middle, newest, oldest]) await store.insert(item);

      const ids = (await store.listByUser(userId)).map((row) => row.id);

      expect(ids).toEqual([newest.id, middle.id, oldest.id]);
    });

    it("listByUser never returns another user's rows", async () => {
      const store = await makeStore();
      const userA = await makeUserId();
      const userB = await makeUserId();
      const ofA = makeItem(0, { userId: userA });
      const ofB = makeItem(1, { userId: userB });
      await store.insert(ofA);
      await store.insert(ofB);

      expect((await store.listByUser(userA)).map((row) => row.id)).toEqual([ofA.id]);
      expect((await store.listByUser(userB)).map((row) => row.id)).toEqual([ofB.id]);
    });

    it('anonymous rows are never listed for a user', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const anonymous = makeItem(0, { userId: null });
      const own = makeItem(1, { userId });
      await store.insert(anonymous);
      await store.insert(own);

      expect((await store.listByUser(userId)).map((row) => row.id)).toEqual([own.id]);
      expect(await store.listByUser(await makeUserId())).toEqual([]);
    });

    it('listAll returns every row, anonymous ones included, newest first', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const oldest = makeItem(0, { userId });
      const anonymous = makeItem(10, { userId: null });
      const newest = makeItem(20, { userId });
      for (const item of [anonymous, oldest, newest]) await store.insert(item);
      const created = new Set([oldest.id, anonymous.id, newest.id]);

      const all = await store.listAll();
      const ids = all.filter((row) => created.has(row.id)).map((row) => row.id);

      expect(ids).toEqual([newest.id, anonymous.id, oldest.id]);
      const times = all.map((row) => Date.parse(row.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('listAll filters by kind, by status and by both', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const bug = makeItem(0, { userId, kind: 'bug' });
      const idea = makeItem(10, { userId: null, kind: 'idea' });
      const doneIdea = makeItem(20, { userId, kind: 'idea' });
      for (const item of [bug, idea, doneIdea]) await store.insert(item);
      await store.updateStatus(doneIdea.id, 'done');
      const created = new Set([bug.id, idea.id, doneIdea.id]);
      const mine = (rows: FeedbackItem[]) =>
        rows.filter((row) => created.has(row.id)).map((row) => row.id);

      const ideas = await store.listAll({ kind: 'idea' });
      expect(mine(ideas)).toEqual([doneIdea.id, idea.id]);
      expect(ideas.every((row) => row.kind === 'idea')).toBe(true);

      const fresh = await store.listAll({ status: 'new' });
      expect(mine(fresh)).toEqual([idea.id, bug.id]);
      expect(fresh.every((row) => row.status === 'new')).toBe(true);

      expect(mine(await store.listAll({ kind: 'idea', status: 'done' }))).toEqual([doneIdea.id]);
      expect(mine(await store.listAll({ kind: 'rating' }))).toEqual([]);
      expect(mine(await store.listAll({}))).toEqual([doneIdea.id, idea.id, bug.id]);
    });

    it('updateStatus returns the updated row and the lists show the new status', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const item = makeItem(0, { userId, context: { level: 'B1' } });
      await store.insert(item);

      const updated = await store.updateStatus(item.id, 'planned');

      expect(updated).toEqual({ ...item, status: 'planned' });
      expect(await store.listByUser(userId)).toEqual([{ ...item, status: 'planned' }]);
    });

    it('updateStatus works on an anonymous row', async () => {
      const store = await makeStore();
      const item = makeItem(0, { userId: null });
      await store.insert(item);

      expect(await store.updateStatus(item.id, 'seen')).toEqual({ ...item, status: 'seen' });
    });

    it('updateStatus returns null for an unknown id', async () => {
      const store = await makeStore();

      expect(await store.updateStatus(randomUUID(), 'done')).toBeNull();
      expect(await store.updateStatus('no-such-id', 'done')).toBeNull();
    });

    it('insert rejects a duplicate id and keeps the first row', async () => {
      const store = await makeStore();
      const userId = await makeUserId();
      const first = makeItem(0, { userId });
      await store.insert(first);

      const again = store.insert({ ...first, message: 'second row with the same id' });

      await expect(again).rejects.toThrow(`feedback ${first.id} already exists`);
      expect(await store.listByUser(userId)).toEqual([first]);
    });
  });
}
