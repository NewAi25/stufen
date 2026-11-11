// Integration test for the Postgres adapter (P1-33). Needs a real PostgreSQL
// with the migrations applied and is skipped when DATABASE_URL is not set.
//
//   DATABASE_URL=postgres://stufen@localhost:5497/stufen pnpm --filter @stufen/core-entitlements test
//
// It creates its own users through the owner connection, the way core-auth
// does at sign up, and deletes them and its own flags at the end. Nothing else
// in the database is changed, so it can share a database with other tests.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import { createDb, sql, withUser } from '@stufen/db';
import type { Database, Views } from '@stufen/db';
import {
  LimitExceededError,
  createEntitlements,
  createInMemoryEntitlementStore,
  createPostgresEntitlementStore,
  postgresDayKeyFor,
} from '../src/index';
import { runEntitlementStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

/** One owner connection plus a record of every row made through it. */
function createFixture() {
  let db: Database | undefined;
  const userIds: string[] = [];
  const flagKeys: string[] = [];

  const connection = (): Database => {
    db ??= createDb(url as string);
    return db;
  };

  return {
    db: connection,

    /** Inserts a user as owner and calls ensure_profile, as sign up does. */
    async newUser(timezone?: string): Promise<string> {
      const id = randomUUID();
      userIds.push(id);
      await connection()
        .insertInto('users')
        .values({ id, email: `p133-${id}@example.test`, name: 'P1-33 test' })
        .execute();
      await sql`select ensure_profile(${id}::uuid)`.execute(connection());
      if (timezone !== undefined) {
        await connection().updateTable('profiles').set({ timezone }).where('id', '=', id).execute();
      }
      return id;
    },

    newFlagKey(): string {
      const key = `p133-${randomUUID()}`;
      flagKeys.push(key);
      return key;
    },

    /** Deletes the users and flags made here, then closes the connection. */
    async cleanup(): Promise<void> {
      if (!db) return;
      // Profiles, entitlements, conversations, messages, submissions and
      // recordings go with the users (on delete cascade).
      if (userIds.length > 0) await db.deleteFrom('users').where('id', 'in', userIds).execute();
      if (flagKeys.length > 0) {
        await db.deleteFrom('feature_flags').where('key', 'in', flagKeys).execute();
      }
      await db.destroy();
      db = undefined;
    },
  };
}

describe.skipIf(!url)('Postgres store: shared contract', () => {
  const fixture = createFixture();

  runEntitlementStoreContract('Postgres', () => createPostgresEntitlementStore(fixture.db()), {
    newUserId: () => fixture.newUser(),
    missingUserId: async () => randomUUID(),
    newFlagKey: () => fixture.newFlagKey(),
    cleanup: () => fixture.cleanup(),
  });
});

describe.skipIf(!url)('Postgres store on a real Postgres', () => {
  const fixture = createFixture();
  let db: Database;
  let userA: string;
  let userB: string;

  /** The full service over the Postgres store, with the local day from Postgres. */
  const service = () => {
    const store = createPostgresEntitlementStore(db);
    const bus = createEventBus();
    const entitlements = createEntitlements({ store, bus, dayKeyFor: postgresDayKeyFor(db) });
    return { store, bus, entitlements };
  };

  beforeAll(async () => {
    db = fixture.db();
    userA = await fixture.newUser();
    userB = await fixture.newUser();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  describe('entitlement row', () => {
    it('the default row from ensure_profile is read as free_beta', async () => {
      const { store, entitlements } = service();

      const stored = await store.getEntitlement(userA);

      expect(stored).toMatchObject({
        userId: userA,
        plan: 'free_beta',
        features: {},
        // Since migration 0005 the row holds only per user overrides.
        limits: {},
        source: 'default',
        expiresAt: null,
      });
      // The service returns the existing row. It does not write a second default.
      expect(await entitlements.plan(userA)).toEqual(stored);
      expect(await entitlements.can(userA, 'tutor')).toBe(true);
    });

    it('setPlan through the service persists and emits entitlement.changed', async () => {
      const user = await fixture.newUser();
      const { bus, entitlements } = service();
      const changed = vi.fn(async () => {});
      bus.on('entitlement.changed', changed);

      const saved = await entitlements.setPlan(user, 'plus', 'manual');

      expect(saved).toMatchObject({ userId: user, plan: 'plus', source: 'manual' });
      expect(changed).toHaveBeenCalledTimes(1);
      expect(changed).toHaveBeenCalledWith({ userId: user, plan: 'plus' });
      // Read back two ways: as the owner, and through a second store as the learner.
      const asOwner = await db
        .selectFrom('entitlements')
        .select(['plan', 'source'])
        .where('user_id', '=', user)
        .executeTakeFirstOrThrow();
      expect(asOwner).toEqual({ plan: 'plus', source: 'manual' });
      expect(await createPostgresEntitlementStore(db).getEntitlement(user)).toEqual(saved);
    });

    it('setPlan keeps the overrides that were on the row', async () => {
      const user = await fixture.newUser();
      const { store, entitlements } = service();
      const before = await store.getEntitlement(user);

      const saved = await entitlements.setPlan(user, 'pro', 'manual');

      expect(saved.limits).toEqual(before?.limits);
      expect(saved.features).toEqual({});
    });
  });

  describe('one learner cannot read another', () => {
    it('the store hands each user the own row', async () => {
      const { store } = service();
      expect((await store.getEntitlement(userA))?.userId).toBe(userA);
      expect((await store.getEntitlement(userB))?.userId).toBe(userB);
    });

    it("the role the store reads as sees A's row only, never B's", async () => {
      // The store reads inside withUser(userId). This is what that role can see.
      const visible = await withUser(db, userA, (trx) =>
        trx.selectFrom('entitlements').select('user_id').execute(),
      );
      expect(visible).toEqual([{ user_id: userA }]);
      const asked = await withUser(db, userA, (trx) =>
        trx.selectFrom('entitlements').select('user_id').where('user_id', '=', userB).execute(),
      );
      expect(asked).toEqual([]);
    });

    it('a signed out read of an entitlement finds nothing', async () => {
      const rows = await withUser(db, null, (trx) =>
        trx.selectFrom('entitlements').select('user_id').where('user_id', '=', userA).execute(),
      );
      expect(rows).toEqual([]);
    });
  });
});

describe.skipIf(!url)('Postgres store: usage counted from real rows', () => {
  const fixture = createFixture();
  let db: Database;
  let learner: string;
  let bystander: string;

  const LIMITS = [
    'tutor_messages_per_day',
    'writing_grades_per_day',
    'speech_minutes_per_day',
  ] as const;

  const service = () => {
    const store = createPostgresEntitlementStore(db);
    const dayKeyFor = postgresDayKeyFor(db);
    const entitlements = createEntitlements({ store, bus: createEventBus(), dayKeyFor });
    /** What the store counts for the user on the user's own local day. */
    const used = async (userId: string) => {
      const day = await dayKeyFor(userId, new Date());
      return Promise.all(LIMITS.map((limit) => store.usedToday(userId, limit, day)));
    };
    const remaining = (userId: string) =>
      Promise.all(LIMITS.map((limit) => entitlements.remaining(userId, limit)));
    return { store, dayKeyFor, entitlements, used, remaining };
  };

  /** Written as owner, the way the routes will write them: what the view counts. */
  const writeSubmission = (userId: string) =>
    db
      .insertInto('writing_submissions')
      .values({
        user_id: userId,
        language_code: 'de',
        prompt: 'Schreib etwas.',
        text: 'Ich lerne.',
        target_level: 'A1',
      })
      .execute();

  const writeTutorMessages = async (userId: string) => {
    const conversation = await db
      .insertInto('tutor_conversations')
      .values({ user_id: userId, language_code: 'de', level: 'A1' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('tutor_messages')
      .values([
        { conversation_id: conversation.id, role: 'user', content: 'Hallo' },
        { conversation_id: conversation.id, role: 'assistant', content: 'Hallo! Wie geht es dir?' },
        { conversation_id: conversation.id, role: 'user', content: 'Gut, danke' },
      ])
      .execute();
  };

  const writeRecording = (userId: string, durationMs: number) =>
    db
      .insertInto('speech_recordings')
      .values({ user_id: userId, duration_ms: durationMs })
      .execute();

  beforeAll(async () => {
    db = fixture.db();
    learner = await fixture.newUser();
    bystander = await fixture.newUser();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it('usedToday is 0 for every limit before anything was used', async () => {
    const { used, remaining } = service();
    expect(await used(learner)).toEqual([0, 0, 0]);
    expect(await remaining(learner)).toEqual([200, 20, 30]);
  });

  it('two learner messages, one submission and 90 seconds of speech count as 2, 1 and 2', async () => {
    const { used, remaining } = service();
    await writeTutorMessages(learner);
    await writeSubmission(learner);
    await writeRecording(learner, 90_000);

    // The assistant message is not counted. 90 seconds round up to 2 minutes.
    expect(await used(learner)).toEqual([2, 1, 2]);
    expect(await remaining(learner)).toEqual([198, 19, 28]);
  });

  it('consume through the service does not write, and throws once a tiny override is reached', async () => {
    const { store, entitlements, used } = service();

    // 198 are left, so this passes. recordUse is a no op: the route writes the row.
    await entitlements.consume(learner, 'tutor_messages_per_day');
    expect(await used(learner)).toEqual([2, 1, 2]);

    // A per user override of 2 tutor messages a day: the 2 already sent use it up.
    const row = await entitlements.plan(learner);
    await store.upsertEntitlement({ ...row, limits: { ...row.limits, tutor_messages_per_day: 2 } });

    expect(await entitlements.remaining(learner, 'tutor_messages_per_day')).toBe(0);
    const failure = await entitlements.consume(learner, 'tutor_messages_per_day').catch((e) => e);
    expect(failure).toBeInstanceOf(LimitExceededError);
    expect(failure).toMatchObject({ limitKey: 'tutor_messages_per_day', limit: 2, used: 2 });
    // The other limits keep their value from the row.
    expect(await entitlements.remaining(learner, 'writing_grades_per_day')).toBe(19);
    await expect(entitlements.consume(learner, 'writing_grades_per_day')).resolves.toBeUndefined();
  });

  it('usage belongs to one user and one day', async () => {
    const { store, used } = service();

    expect(await used(bystander)).toEqual([0, 0, 0]);
    expect(await store.usedToday(learner, 'tutor_messages_per_day', '2001-01-01')).toBe(0);
    // The role the store reads as cannot see the learner's usage as the bystander.
    const seen = await withUser(db, bystander, (trx) =>
      trx.withTables<Views>().selectFrom('daily_usage').select('user_id').execute(),
    );
    expect(seen).toEqual([]);
  });

  it('postgresDayKeyFor gives the local day of the user, which is the day the view uses', async () => {
    const { store, dayKeyFor } = service();
    // UTC+14 and UTC-12 are 26 hours apart, so the two local days always differ.
    const east = await fixture.newUser('Pacific/Kiritimati');
    const west = await fixture.newUser('Etc/GMT+12');
    await writeSubmission(east);
    await writeSubmission(west);

    const eastDay = await dayKeyFor(east, new Date());
    const westDay = await dayKeyFor(west, new Date());

    expect(eastDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(eastDay > westDay).toBe(true);
    expect(await store.usedToday(east, 'writing_grades_per_day', eastDay)).toBe(1);
    expect(await store.usedToday(west, 'writing_grades_per_day', westDay)).toBe(1);
    expect(await store.usedToday(east, 'writing_grades_per_day', westDay)).toBe(0);
    expect(await store.usedToday(west, 'writing_grades_per_day', eastDay)).toBe(0);
  });

  it('postgresDayKeyFor uses the UTC day when profiles.timezone is not a known zone', async () => {
    const { store, dayKeyFor } = service();
    const lost = await fixture.newUser('Not/AZone');
    await writeSubmission(lost);

    const day = await dayKeyFor(lost, new Date());

    const utc = await sql<{ day: string }>`
      select to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as day
    `.execute(db);
    // Read just before and just after, so a run across midnight UTC still passes.
    expect([day, await dayKeyFor(lost, new Date())]).toContain(utc.rows[0]?.day);
    expect(await store.usedToday(lost, 'writing_grades_per_day', day)).toBe(1);
  });

  it('postgresDayKeyFor falls back to the UTC date when the user has no profile', async () => {
    const { dayKeyFor } = service();
    const nobody = randomUUID();
    expect(await dayKeyFor(nobody, new Date('2026-11-06T23:30:00.000Z'))).toBe('2026-11-06');
  });
});

describe.skipIf(!url)('Postgres store: feature flags', () => {
  const fixture = createFixture();
  let db: Database;

  /** The same flag in both adapters, each behind the full service. */
  const both = async (enabled: boolean, rules: { percent?: number; deny?: string[] }) => {
    const key = fixture.newFlagKey();
    const postgresStore = createPostgresEntitlementStore(db);
    const memoryStore = createInMemoryEntitlementStore();
    await postgresStore.setFlag({ key, enabled, rules });
    await memoryStore.setFlag({ key, enabled, rules });
    const postgres = createEntitlements({ store: postgresStore, bus: createEventBus() });
    const memory = createEntitlements({ store: memoryStore, bus: createEventBus() });
    return { key, postgres, memory };
  };

  beforeAll(() => {
    db = fixture.db();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it('a 50 percent rule picks the same users as the in memory store', async () => {
    const { key, postgres, memory } = await both(true, { percent: 50 });
    // The percent rule hashes key plus user id and reads no row, so ids without a user will do.
    const users = Array.from({ length: 40 }, () => randomUUID());

    const fromPostgres = await Promise.all(users.map((user) => postgres.flag(key, user)));
    const fromMemory = await Promise.all(users.map((user) => memory.flag(key, user)));

    expect(fromPostgres).toEqual(fromMemory);
    // With 40 users at 50 percent both answers occur.
    expect(new Set(fromPostgres)).toEqual(new Set([true, false]));
  });

  it.each([0, 100])('a %i percent rule is all or nothing, as in memory', async (percent) => {
    const { key, postgres, memory } = await both(true, { percent });
    const users = Array.from({ length: 5 }, () => randomUUID());

    const fromPostgres = await Promise.all(users.map((user) => postgres.flag(key, user)));

    expect(fromPostgres).toEqual(users.map(() => percent === 100));
    expect(fromPostgres).toEqual(await Promise.all(users.map((user) => memory.flag(key, user))));
  });

  it('a disabled flag and an unknown key are off, a deny list wins', async () => {
    const denied = randomUUID();
    const off = await both(false, { percent: 100 });
    const on = await both(true, { deny: [denied] });

    expect(await off.postgres.flag(off.key, randomUUID())).toBe(false);
    expect(await on.postgres.flag(fixture.newFlagKey(), randomUUID())).toBe(false);
    expect(await on.postgres.flag(on.key, denied)).toBe(false);
    expect(await on.postgres.flag(on.key, randomUUID())).toBe(true);
    // Signed out: only the switch applies.
    expect(await on.postgres.flag(on.key)).toBe(true);
  });

  it('a flag is readable signed out and by a learner, and a learner cannot write one', async () => {
    const { key } = await both(true, {});
    const learner = await fixture.newUser();
    const read = (userId: string | null) =>
      withUser(db, userId, (trx) =>
        trx.selectFrom('feature_flags').select('enabled').where('key', '=', key).execute(),
      );

    expect(await read(null)).toEqual([{ enabled: true }]);
    expect(await read(learner)).toEqual([{ enabled: true }]);
    // Since migration 0006 the learner role has no write grant on content
    // tables, so every write is refused with "permission denied" (42501).
    const updated = withUser(db, learner, (trx) =>
      trx.updateTable('feature_flags').set({ enabled: false }).where('key', '=', key).execute(),
    );
    await expect(updated).rejects.toMatchObject({ code: '42501' });
    const inserted = withUser(db, learner, (trx) =>
      trx.insertInto('feature_flags').values({ key: fixture.newFlagKey() }).execute(),
    );
    await expect(inserted).rejects.toMatchObject({ code: '42501' });
    const deleted = withUser(db, learner, (trx) =>
      trx.deleteFrom('feature_flags').where('key', '=', key).execute(),
    );
    await expect(deleted).rejects.toMatchObject({ code: '42501' });
    // Signed out is no different, and the flag is untouched.
    const signedOut = withUser(db, null, (trx) =>
      trx.updateTable('feature_flags').set({ enabled: false }).where('key', '=', key).execute(),
    );
    await expect(signedOut).rejects.toMatchObject({ code: '42501' });
    expect(await read(null)).toEqual([{ enabled: true }]);
  });
});
