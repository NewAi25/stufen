// Integration test for the Postgres adapter. Needs a real PostgreSQL with the
// migrations applied and is skipped when DATABASE_URL is not set. See "How to
// test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-identity test
//
// It creates its own rows in `users` through the owner connection, the way
// core-auth does at sign up, and deletes exactly those rows at the end. The
// delete cascades to profiles, learner_languages and entitlements. Nothing
// else in the database is changed.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { EventMap } from '@stufen/contracts';
import { createDb, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createIdentity, createPostgresProfileStore } from '../src/index';
import type { ProfileStore } from '../src/index';
import {
  patchProfile,
  selectLearnerLanguages,
  selectProfile,
  upsertLearnerLanguageRow,
} from '../src/postgres-store';
import { runProfileStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('Postgres ProfileStore on a real Postgres', () => {
  const createdUsers: string[] = [];
  let db: Database;
  let store: ProfileStore;

  /** Inserts a row in `users` as the owner and remembers it for the clean up. */
  async function newUser(name: string | null = null): Promise<string> {
    const id = randomUUID();
    createdUsers.push(id);
    await db
      .insertInto('users')
      .values({ id, email: `p132-${id}@example.test`, name })
      .execute();
    return id;
  }

  beforeAll(() => {
    db = createDb(url as string);
    store = createPostgresProfileStore(db);
  });

  afterAll(async () => {
    if (createdUsers.length > 0) {
      await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
    }
    await db.destroy();
  });

  runProfileStoreContract('Postgres', () => ({ store, newUserId: () => newUser() }));

  const at = () => new Date().toISOString();

  /** A stored profile for a fresh user. */
  async function seeded(displayName: string) {
    const id = await newUser();
    return store.insertProfile({
      id,
      displayName,
      uiLocale: 'en',
      timezone: 'UTC',
      dailyGoalMinutes: 15,
      activeLanguage: null,
      createdAt: at(),
      updatedAt: at(),
    });
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

  // The port has no separate "who is asking": every method acts for the user
  // id it is given. So the cross user checks run the adapter's own statements
  // inside user A's transaction and point them at user B.
  describe('row security: user A against user B', () => {
    it("A cannot read B's profile", async () => {
      const a = await seeded('A');
      const b = await seeded('B');

      const seen = await withUser(db, a.id, (trx) => selectProfile(trx, b.id));

      expect(seen).toBeNull();
    });

    it("A cannot change B's profile", async () => {
      const a = await seeded('A');
      const b = await seeded('B');

      const changed = await withUser(db, a.id, (trx) =>
        patchProfile(trx, b.id, { displayName: 'Taken over', updatedAt: at() }),
      );

      expect(changed).toBeNull();
      expect(await store.getProfile(b.id)).toEqual(b);
      expect(await store.getProfile(a.id)).toEqual(a);
    });

    it("A cannot list or write B's learner languages", async () => {
      const a = await seeded('A');
      const b = await seeded('B');
      const row = await store.upsertLearnerLanguage({
        userId: b.id,
        languageCode: 'de',
        targetLevel: 'B2',
        startedAt: at(),
      });

      const listed = await withUser(db, a.id, (trx) => selectLearnerLanguages(trx, b.id));
      // 42501 is insufficient_privilege: the row level security policy refused the row.
      const insertNew = await errorCodeOf(
        withUser(db, a.id, (trx) =>
          upsertLearnerLanguageRow(trx, {
            userId: b.id,
            languageCode: 'fr',
            targetLevel: 'C2',
            startedAt: at(),
          }),
        ),
      );
      const overwrite = await errorCodeOf(
        withUser(db, a.id, (trx) =>
          upsertLearnerLanguageRow(trx, {
            userId: b.id,
            languageCode: 'de',
            targetLevel: 'C2',
            startedAt: at(),
          }),
        ),
      );

      expect(listed).toEqual([]);
      expect(insertNew).toBe('42501');
      expect(overwrite).toBe('42501');
      expect(await store.listLearnerLanguages(b.id)).toEqual([row]);
    });

    it("a patch that carries another user's id changes nothing for that user", async () => {
      const a = await seeded('A');
      const b = await seeded('B');
      // What a careless caller could pass at run time. The type has no `id`.
      const smuggled = { id: b.id, displayName: 'Renamed', updatedAt: at() };

      const updated = await store.updateProfile(a.id, smuggled);

      expect(updated?.id).toBe(a.id);
      expect(updated?.displayName).toBe('Renamed');
      expect(await store.getProfile(b.id)).toEqual(b);
    });
  });

  describe('insertProfile on Postgres', () => {
    const defaults = (id: string) => ({
      id,
      displayName: null,
      uiLocale: 'en',
      timezone: 'UTC',
      dailyGoalMinutes: 15,
      activeLanguage: null,
      createdAt: '2001-01-01T00:00:00.000Z',
      updatedAt: '2001-01-01T00:00:00.000Z',
    });

    it('with a null display name keeps the name ensure_profile copied from users', async () => {
      const named = await newUser('Lise Meitner');
      const unnamed = await newUser(null);

      expect((await store.insertProfile(defaults(named))).displayName).toBe('Lise Meitner');
      // ensure_profile stores an empty string when users.name is null.
      expect((await store.insertProfile(defaults(unnamed))).displayName).toBe('');
    });

    it('takes createdAt and updatedAt from the database clock, not from the caller', async () => {
      const before = Date.now();
      const stored = await store.insertProfile(defaults(await newUser()));

      expect(stored.createdAt).toBe(stored.updatedAt);
      // One minute of slack for a database on another clock.
      expect(Math.abs(Date.parse(stored.createdAt) - before)).toBeLessThan(60_000);
    });

    it('rejects a user id that has no row in users and stores nothing', async () => {
      const stranger = randomUUID();

      await expect(store.insertProfile(defaults(stranger))).rejects.toThrow(
        /there is no row in users/,
      );
      expect(await store.getProfile(stranger)).toBeNull();
    });

    it('two inserts racing for one user end with one untouched row', async () => {
      const id = await newUser();

      const [first, second] = await Promise.all([
        store.insertProfile({ ...defaults(id), displayName: 'First', dailyGoalMinutes: 20 }),
        store.insertProfile({ ...defaults(id), displayName: 'Second', dailyGoalMinutes: 40 }),
      ]);

      expect(second).toEqual(first);
      expect(await store.getProfile(id)).toEqual(first);
    });
  });

  describe('createIdentity on the Postgres store', () => {
    it('runs the whole facade and emits user.language_set', async () => {
      const userId = await newUser('Emmy Noether');
      const bus = createEventBus();
      const emitted: EventMap['user.language_set'][] = [];
      bus.on('user.language_set', async (payload) => {
        emitted.push(payload);
      });
      const identity = createIdentity({ store, bus });

      const created = await identity.ensureProfile(userId, 'Emmy');
      const again = await identity.ensureProfile(userId, 'Someone else');
      const updated = await identity.updateProfile(userId, {
        dailyGoalMinutes: 30,
        timezone: 'Europe/Berlin',
      });
      await identity.setActiveLanguage(userId, 'de', 'B2');
      await identity.setActiveLanguage(userId, 'de', 'C1');
      const profile = await identity.getProfile(userId);
      const languages = await identity.listLearnerLanguages(userId);

      expect(created).toMatchObject({ id: userId, displayName: 'Emmy', dailyGoalMinutes: 15 });
      expect(again).toEqual(created);
      expect(updated).toMatchObject({ dailyGoalMinutes: 30, timezone: 'Europe/Berlin' });
      expect(profile).toMatchObject({
        displayName: 'Emmy',
        dailyGoalMinutes: 30,
        timezone: 'Europe/Berlin',
        activeLanguage: 'de',
      });
      expect(languages).toHaveLength(1);
      expect(languages[0]).toMatchObject({
        userId,
        languageCode: 'de',
        targetLevel: 'C1',
        currentLevelEstimate: null,
      });
      expect(emitted).toEqual([
        { userId, language: 'de', targetLevel: 'B2' },
        { userId, language: 'de', targetLevel: 'C1' },
      ]);
    });

    it('getProfile throws ProfileNotFoundError for a user with no profile', async () => {
      const identity = createIdentity({ store, bus: createEventBus() });
      const userId = await newUser();

      await expect(identity.getProfile(userId)).rejects.toThrow(`No profile for user ${userId}`);
    });
  });
});
