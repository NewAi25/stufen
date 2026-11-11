// The behaviour every EventStore adapter shares. Not a test file itself: the
// in memory run and the Postgres run both call runEventStoreContract.
//
// The Postgres run shares one database with other work, so every check uses
// event names nobody else has and never assumes the table is otherwise empty.
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnalyticsEvent, EventStore } from '../src/index';

type MaybePromise<T> = T | Promise<T>;

/**
 * @param name        label of the describe block, for example the adapter name
 * @param makeStore   the store under test, asked for once per check
 * @param makeUserId  an id the store accepts as a user. Postgres needs the id
 *                    of a real profile; the in memory store takes any string
 */
export function runEventStoreContract(
  name: string,
  makeStore: () => MaybePromise<EventStore>,
  makeUserId: () => MaybePromise<string>,
): void {
  describe(`EventStore contract: ${name}`, () => {
    const run = randomUUID().replaceAll('-', '');
    let counter = 0;
    let store: EventStore;

    /** An event name used by this check only. */
    const uniqueName = (label: string) => `contract.${label}.${run}_${++counter}`;

    const event = (
      eventName: string,
      userId: string | null,
      createdAt: string,
      props: Record<string, unknown> = {},
    ): AnalyticsEvent => ({ id: randomUUID(), userId, name: eventName, props, createdAt });

    beforeEach(async () => {
      store = await makeStore();
    });

    it('insert then list by name returns the row as it went in', async () => {
      const userId = await makeUserId();
      const eventName = uniqueName('roundtrip');
      const row = event(eventName, userId, '2026-11-06T09:00:00.000Z', { page: '/learn', n: 2 });

      await store.insert(row);

      expect(await store.list({ name: eventName })).toEqual([row]);
    });

    it('list returns nothing for a name that was never inserted', async () => {
      expect(await store.list({ name: uniqueName('never') })).toEqual([]);
    });

    it('list returns rows oldest first', async () => {
      const eventName = uniqueName('order');
      const late = event(eventName, null, '2026-11-06T12:00:00.000Z');
      const early = event(eventName, null, '2026-11-06T08:00:00.000Z');
      const middle = event(eventName, null, '2026-11-06T10:00:00.000Z');
      for (const row of [late, early, middle]) await store.insert(row);

      const rows = await store.list({ name: eventName });

      expect(rows.map((row) => row.id)).toEqual([early.id, middle.id, late.id]);
    });

    it('filters by user', async () => {
      const userA = await makeUserId();
      const userB = await makeUserId();
      const eventName = uniqueName('by_user');
      const a = event(eventName, userA, '2026-11-06T09:00:00.000Z');
      const b = event(eventName, userB, '2026-11-06T09:01:00.000Z');
      await store.insert(a);
      await store.insert(b);

      expect(await store.list({ name: eventName, userId: userA })).toEqual([a]);
      expect(await store.list({ name: eventName, userId: userB })).toEqual([b]);
      // Without a name the user filter still holds, whatever else is stored.
      const allOfA = await store.list({ userId: userA });
      expect(allOfA).toEqual([a]);
    });

    it('filters by since, keeping rows created at or after it', async () => {
      const eventName = uniqueName('since');
      const before = event(eventName, null, '2026-11-06T09:59:59.999Z');
      const exact = event(eventName, null, '2026-11-06T10:00:00.000Z');
      const after = event(eventName, null, '2026-11-06T10:00:00.001Z');
      for (const row of [before, exact, after]) await store.insert(row);

      const rows = await store.list({ name: eventName, since: '2026-11-06T10:00:00.000Z' });

      expect(rows.map((row) => row.id)).toEqual([exact.id, after.id]);
    });

    it('combines name, user and since with AND', async () => {
      const userId = await makeUserId();
      const eventName = uniqueName('combined');
      const otherName = uniqueName('combined_other');
      const old = event(eventName, userId, '2026-11-06T08:00:00.000Z');
      const wanted = event(eventName, userId, '2026-11-06T11:00:00.000Z');
      const anonymous = event(eventName, null, '2026-11-06T11:00:00.000Z');
      const otherEvent = event(otherName, userId, '2026-11-06T11:00:00.000Z');
      for (const row of [old, wanted, anonymous, otherEvent]) await store.insert(row);

      const rows = await store.list({
        name: eventName,
        userId,
        since: '2026-11-06T10:00:00.000Z',
      });

      expect(rows).toEqual([wanted]);
    });

    it('stores an event without a user and finds it with userId null', async () => {
      const userId = await makeUserId();
      const eventName = uniqueName('null_user');
      const anonymous = event(eventName, null, '2026-11-06T09:00:00.000Z', { kind: 'bug' });
      const signedIn = event(eventName, userId, '2026-11-06T09:01:00.000Z');
      await store.insert(anonymous);
      await store.insert(signedIn);

      expect(await store.list({ name: eventName, userId: null })).toEqual([anonymous]);
      expect(await store.list({ name: eventName })).toEqual([anonymous, signedIn]);
    });

    it('counts the rows with one name', async () => {
      const eventName = uniqueName('count');
      expect(await store.count(eventName)).toBe(0);

      await store.insert(event(eventName, null, '2026-11-06T09:00:00.000Z'));
      await store.insert(event(eventName, null, '2026-11-06T09:01:00.000Z'));
      await store.insert(event(uniqueName('count_other'), null, '2026-11-06T09:02:00.000Z'));

      expect(await store.count(eventName)).toBe(2);
    });

    it('counts every row when no name is given', async () => {
      // Other rows may exist and may arrive meanwhile, so this is a floor.
      const before = await store.count();
      const eventName = uniqueName('count_all');
      await store.insert(event(eventName, null, '2026-11-06T09:00:00.000Z'));
      await store.insert(event(eventName, null, '2026-11-06T09:01:00.000Z'));

      expect(await store.count()).toBeGreaterThanOrEqual(before + 2);
    });

    it('keeps nested props', async () => {
      const eventName = uniqueName('props');
      const props = { tags: ['a', 'b'], nested: { ok: true, score: 0.5, none: null }, text: 'x' };
      await store.insert(event(eventName, null, '2026-11-06T09:00:00.000Z', props));

      const [row] = await store.list({ name: eventName });

      expect(row?.props).toEqual(props);
    });
  });
}
