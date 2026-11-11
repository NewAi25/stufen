// Integration test for the Postgres EventStore (P1-34). Needs a real
// PostgreSQL with the migrations applied and is skipped when DATABASE_URL is
// not set. See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-analytics test
//
// The database may be shared. This file creates its own users, remembers the
// id of every event it inserts, and deletes exactly those rows at the end.
// Nothing else is changed.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createAnalytics, createPostgresEventStore } from '../src/index';
import type { AnalyticsEvent, EventStore } from '../src/index';
import { runEventStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createPostgresEventStore on a real Postgres', () => {
  const run = randomUUID().replaceAll('-', '');
  const startedAt = new Date().toISOString();
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let db: Database;
  let store: EventStore;

  /** An event name only this run uses. */
  const uniqueName = (label: string) => `p134.${label}.${run}`;

  /** A real user with a profile, made the way core-auth does at sign up. */
  async function makeUser(): Promise<string> {
    const id = randomUUID();
    userIds.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p134-${id}@example.test`, name: 'P1-34 test' })
      .execute();
    await sql`select ensure_profile(${id}::uuid)`.execute(db);
    return id;
  }

  /** The store under test, noting every id it is asked to insert. */
  function recording(inner: EventStore): EventStore {
    return {
      insert: async (event: AnalyticsEvent) => {
        eventIds.push(event.id);
        await inner.insert(event);
      },
      list: (filter) => inner.list(filter),
      count: (name) => inner.count(name),
    };
  }

  /** The raw row, read as owner. */
  const rawRow = (id: string) =>
    db.selectFrom('events').selectAll().where('id', '=', id).executeTakeFirst();

  beforeAll(async () => {
    db = createDb(url as string);
    store = recording(createPostgresEventStore(db));
  });

  afterAll(async () => {
    // Events first: deleting a user only sets events.user_id to null.
    if (eventIds.length > 0) await db.deleteFrom('events').where('id', 'in', eventIds).execute();
    // profiles and entitlements go with the users (on delete cascade).
    if (userIds.length > 0) await db.deleteFrom('users').where('id', 'in', userIds).execute();
    await db.destroy();
  });

  runEventStoreContract('Postgres', () => store, makeUser);

  describe('the createAnalytics facade on a real bus', () => {
    it('stores user.signed_up for a real user', async () => {
      const userId = await makeUser();
      const errors: unknown[] = [];
      const analytics = createAnalytics({ store, onError: (error) => errors.push(error) });
      const bus = createEventBus();
      const detach = analytics.attach(bus);

      await bus.emit('user.signed_up', { userId });
      detach();

      expect(errors).toEqual([]);
      const rows = await store.list({ name: 'user.signed_up', userId });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId, name: 'user.signed_up', props: {} });
      expect(Date.parse(rows[0]?.createdAt ?? '')).toBeGreaterThanOrEqual(Date.parse(startedAt));
    });

    it('stores an anonymous feedback.submitted', async () => {
      const feedbackId = randomUUID();
      const errors: unknown[] = [];
      const analytics = createAnalytics({ store, onError: (error) => errors.push(error) });
      const bus = createEventBus();
      const detach = analytics.attach(bus);

      await bus.emit('feedback.submitted', { feedbackId, kind: `bug_${run}` });
      detach();

      expect(errors).toEqual([]);
      // The name is shared with everyone, so pick this run's row by its props.
      const rows = await store.list({ name: 'feedback.submitted', userId: null, since: startedAt });
      const mine = rows.filter((row) => row.props.feedbackId === feedbackId);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({
        userId: null,
        name: 'feedback.submitted',
        props: { feedbackId, kind: `bug_${run}` },
      });
    });

    it('track stores a row for a real user under a name of this run', async () => {
      const userId = await makeUser();
      const name = uniqueName('tracked');
      const analytics = createAnalytics({ store });

      await analytics.track(userId, name, { page: '/learn' });

      const rows = await store.list({ name });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId, name, props: { page: '/learn' } });
      expect(await store.count(name)).toBe(1);
    });
  });

  describe('a user id without a profile', () => {
    it('an unknown user id is stored with user_id null and original_user_id in props', async () => {
      const ghost = randomUUID();
      const name = uniqueName('unknown_user');
      const id = randomUUID();

      await store.insert({
        id,
        userId: ghost,
        name,
        props: { step: 3 },
        createdAt: '2026-11-06T09:00:00.000Z',
      });

      const row = await rawRow(id);
      expect(row?.user_id).toBeNull();
      expect(row?.props).toEqual({ step: 3, original_user_id: ghost });
      expect(await store.list({ name, userId: null })).toEqual([
        {
          id,
          userId: null,
          name,
          props: { step: 3, original_user_id: ghost },
          createdAt: '2026-11-06T09:00:00.000Z',
        },
      ]);
      expect(await store.count(name)).toBe(1);
    });

    it('a user id that is not a uuid is stored the same way', async () => {
      const name = uniqueName('not_a_uuid');
      const id = randomUUID();

      await store.insert({ id, userId: 'u1', name, props: {}, createdAt: startedAt });

      const row = await rawRow(id);
      expect(row?.user_id).toBeNull();
      expect(row?.props).toEqual({ original_user_id: 'u1' });
    });

    it('a deleted user keeps the events, without the user id', async () => {
      const userId = await makeUser();
      const name = uniqueName('deleted_user');
      const id = randomUUID();
      await store.insert({ id, userId, name, props: {}, createdAt: startedAt });
      expect((await rawRow(id))?.user_id).toBe(userId);

      await db.deleteFrom('users').where('id', '=', userId).execute();

      expect((await rawRow(id))?.user_id).toBeNull();
      // A later event for that id no longer has a profile to point at.
      const later = randomUUID();
      await store.insert({ id: later, userId, name, props: {}, createdAt: startedAt });
      expect((await rawRow(later))?.props).toEqual({ original_user_id: userId });
    });
  });

  describe('props', () => {
    it('survive a round trip as an object, not as JSON text', async () => {
      const name = uniqueName('props');
      const id = randomUUID();
      const props = {
        text: 'Grüße, "quoted" and a \\ backslash',
        count: 3,
        ratio: 0.25,
        flag: false,
        nothing: null,
        list: [1, 'two', { three: 3 }],
        nested: { deep: { deeper: ['x'] } },
      };

      await store.insert({ id, userId: null, name, props, createdAt: startedAt });

      const row = await rawRow(id);
      expect(typeof row?.props).toBe('object');
      expect(row?.props).toEqual(props);
      const kind = await sql<{ kind: string }>`
        select jsonb_typeof(props) as kind from events where id = ${id}::uuid
      `.execute(db);
      expect(kind.rows[0]?.kind).toBe('object');
      const [listed] = await store.list({ name });
      expect(listed?.props).toEqual(props);
    });

    it('empty props are stored as an empty object', async () => {
      const name = uniqueName('empty_props');
      const id = randomUUID();
      await store.insert({ id, userId: null, name, props: {}, createdAt: startedAt });
      expect((await rawRow(id))?.props).toEqual({});
    });
  });

  describe('the access model the adapter relies on', () => {
    /** True for the Postgres error "permission denied" (insufficient_privilege). */
    const isDenied = (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';

    it('the database refuses an event that carries someone else as user', async () => {
      const userA = await makeUser();
      const userB = await makeUser();
      const id = randomUUID();
      eventIds.push(id);

      const attempt = withUser(db, userA, (trx) =>
        trx
          .insertInto('events')
          .values({ id, user_id: userB, name: uniqueName('forged') })
          .execute(),
      );

      await expect(attempt).rejects.toSatisfy(isDenied);
      expect(await rawRow(id)).toBeUndefined();
    });

    it('the app role cannot read events, not even its own', async () => {
      const userId = await makeUser();
      const name = uniqueName('unreadable');
      await store.insert({ id: randomUUID(), userId, name, props: {}, createdAt: startedAt });

      let seen: number | 'denied';
      try {
        seen = await withUser(db, userId, async (trx) => {
          const rows = await trx
            .selectFrom('events')
            .select('id')
            .where('name', '=', name)
            .execute();
          return rows.length;
        });
      } catch (error) {
        if (!isDenied(error)) throw error;
        seen = 'denied';
      }

      expect(seen === 0 || seen === 'denied').toBe(true);
      expect(await store.count(name)).toBe(1);
    });
  });
});
