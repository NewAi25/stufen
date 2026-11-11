// Integration test. Needs a real PostgreSQL with the migrations applied and is
// skipped when DATABASE_URL is not set. See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/db test
//
// It creates two users, checks what each of them can see through withUser,
// and deletes them again. Nothing else in the database is changed.

import { randomUUID } from 'node:crypto';
import { CompiledQuery, Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withUser } from '../src/index';
import type { DB, Views } from '../src/index';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('withUser on a real Postgres', () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const emailA = `p024-a-${userA}@example.test`;
  const emailB = `p024-b-${userB}@example.test`;
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createDb(url as string);
    // Outside withUser the connection user owns the tables and skips row
    // level security, the way core-auth creates a user at sign up.
    await db
      .insertInto('users')
      .values([
        { id: userA, email: emailA, name: 'Test A' },
        { id: userB, email: emailB, name: 'Test B' },
      ])
      .execute();
    await sql`select ensure_profile(${userA}::uuid)`.execute(db);
    await sql`select ensure_profile(${userB}::uuid)`.execute(db);
  });

  afterAll(async () => {
    // profiles, entitlements and sessions go with the users (on delete cascade).
    await db.deleteFrom('users').where('id', 'in', [userA, userB]).execute();
    await db.destroy();
  });

  /** True for the Postgres error "permission denied" (insufficient_privilege). */
  const isDenied = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';

  /**
   * Runs one statement inside withUser and says what came of it: 'denied' when
   * Postgres refused it, otherwise the number of rows it returned or changed.
   */
  const outcome = async (
    userId: string | null,
    run: (trx: Transaction<DB>) => Promise<number>,
  ): Promise<number | 'denied'> => {
    try {
      return await withUser(db, userId, run);
    } catch (error) {
      if (isDenied(error)) return 'denied';
      throw error;
    }
  };

  const profileIds = (userId: string | null) =>
    withUser(db, userId, async (trx) => {
      const rows = await trx.selectFrom('profiles').select('id').execute();
      return rows.map((row) => row.id);
    });

  it('ensure_profile made a profile for both users', async () => {
    const rows = await db
      .selectFrom('profiles')
      .select('id')
      .where('id', 'in', [userA, userB])
      .execute();
    expect(rows.map((row) => row.id).sort()).toEqual([userA, userB].sort());
  });

  it('inside withUser(A) a select on profiles returns only A', async () => {
    expect(await profileIds(userA)).toEqual([userA]);
  });

  it('inside withUser(B) a select on profiles returns only B', async () => {
    expect(await profileIds(userB)).toEqual([userB]);
  });

  it('inside withUser(null) a select on profiles returns nothing', async () => {
    expect(await profileIds(null)).toEqual([]);
  });

  it('A cannot read B by asking for B by id', async () => {
    const rows = await withUser(db, userA, (trx) =>
      trx.selectFrom('profiles').select('id').where('id', '=', userB).execute(),
    );
    expect(rows).toEqual([]);
  });

  it('A can update the own profile and cannot update B', async () => {
    const [own, other] = await withUser(db, userA, async (trx) => {
      const mine = await trx
        .updateTable('profiles')
        .set({ daily_goal_minutes: 20 })
        .where('id', '=', userA)
        .executeTakeFirst();
      const theirs = await trx
        .updateTable('profiles')
        .set({ daily_goal_minutes: 99 })
        .where('id', '=', userB)
        .executeTakeFirst();
      return [mine.numUpdatedRows, theirs.numUpdatedRows];
    });
    expect(own).toBe(1n);
    expect(other).toBe(0n);
    const b = await db
      .selectFrom('profiles')
      .select('daily_goal_minutes')
      .where('id', '=', userB)
      .executeTakeFirstOrThrow();
    expect(b.daily_goal_minutes).toBe(15);
  });

  it('each user reads only the own entitlement', async () => {
    const rows = await withUser(db, userA, (trx) =>
      trx.selectFrom('entitlements').select(['user_id', 'plan']).execute(),
    );
    expect(rows).toEqual([{ user_id: userA, plan: 'free_beta' }]);
  });

  it('the content table languages is readable by A, by B and when signed out', async () => {
    const codes = (userId: string | null) =>
      withUser(db, userId, async (trx) => {
        const rows = await trx.selectFrom('languages').select('code').orderBy('code').execute();
        return rows.map((row) => row.code);
      });
    const forA = await codes(userA);
    expect(forA).toEqual(expect.arrayContaining(['de', 'fr', 'nl']));
    expect(await codes(userB)).toEqual(forA);
    expect(await codes(null)).toEqual(forA);
  });

  it('sessions: the owner sees the row, withUser sees nothing or is denied', async () => {
    const token = `p026-${randomUUID()}`;
    // Owner work, the way core-auth writes a session at sign in.
    await db
      .insertInto('sessions')
      .values({ user_id: userA, token, expires_at: new Date(Date.now() + 60_000) })
      .execute();

    const asOwner = await db
      .selectFrom('sessions')
      .select(['user_id', 'token'])
      .where('token', '=', token)
      .execute();
    expect(asOwner).toEqual([{ user_id: userA, token }]);

    // Learner facing work: even the own session row is out of reach.
    const readSessions = (userId: string | null) =>
      outcome(userId, async (trx) => {
        const rows = await trx.selectFrom('sessions').select('token').execute();
        return rows.length;
      });
    expect(['denied', 0]).toContain(await readSessions(userA));
    expect(['denied', 0]).toContain(await readSessions(userB));
    expect(['denied', 0]).toContain(await readSessions(null));

    // Writes too: A cannot forge a session or delete the real one.
    const forged = await outcome(userA, async (trx) => {
      await trx
        .insertInto('sessions')
        .values({ user_id: userA, token: `${token}-forged`, expires_at: new Date() })
        .execute();
      return 1;
    });
    expect(forged).toBe('denied');
    const deleted = await outcome(userA, async (trx) => {
      const result = await trx.deleteFrom('sessions').where('token', '=', token).executeTakeFirst();
      return Number(result.numDeletedRows);
    });
    expect(['denied', 0]).toContain(deleted);

    const still = await db
      .selectFrom('sessions')
      .select('token')
      .where('user_id', '=', userA)
      .execute();
    expect(still).toEqual([{ token }]);
  });

  it.each(['accounts', 'verifications'] as const)(
    '%s: withUser sees nothing or is denied',
    async (table) => {
      const read = await outcome(userA, async (trx) => {
        const rows = await trx.selectFrom(table).select('id').execute();
        return rows.length;
      });
      expect(['denied', 0]).toContain(read);
    },
  );

  it('runs fn as stufen_app with app.user_id set', async () => {
    const inside = await withUser(db, userA, async (trx) => {
      const result = await sql<{ role: string; user_id: string }>`
        select current_user as role, current_setting('app.user_id', true) as user_id
      `.execute(trx);
      return result.rows[0];
    });
    expect(inside).toEqual({ role: 'stufen_app', user_id: userA });
  });

  it('leaves no role and no user id behind on the connection', async () => {
    await withUser(db, userA, async () => undefined);
    const after = await sql<{ same_role: boolean; user_id: string }>`
      select current_user = session_user as same_role,
             coalesce(current_setting('app.user_id', true), '') as user_id
    `.execute(db);
    expect(after.rows[0]).toEqual({ same_role: true, user_id: '' });
  });

  it('rolls back what fn wrote when fn throws', async () => {
    await expect(
      withUser(db, userB, async (trx) => {
        await trx
          .updateTable('profiles')
          .set({ display_name: 'should not stay' })
          .where('id', '=', userB)
          .execute();
        throw new Error('box failed');
      }),
    ).rejects.toThrow('box failed');
    const b = await db
      .selectFrom('profiles')
      .select('display_name')
      .where('id', '=', userB)
      .executeTakeFirstOrThrow();
    expect(b.display_name).toBe('Test B');
  });

  it('returns values in the JS types that src/schema.ts declares', async () => {
    const profile = await withUser(db, userA, (trx) =>
      trx.selectFrom('profiles').selectAll().where('id', '=', userA).executeTakeFirstOrThrow(),
    );
    expect(profile.created_at).toBeInstanceOf(Date);
    expect(typeof profile.daily_goal_minutes).toBe('number');
    expect(profile.active_language).toBeNull();

    const entitlement = await withUser(db, userA, (trx) =>
      trx.selectFrom('entitlements').select('limits').executeTakeFirstOrThrow(),
    );
    expect(entitlement.limits).toEqual({});

    // Types with no row to read yet: ask Postgres for one value of each.
    const sample = await sql<Record<string, unknown>>`
      select 0.5::numeric(4,3) as "numeric", 1.5::real as "real", 7::smallint as "smallint",
             date '2026-11-05' as "date", array[gen_random_uuid()]::uuid[] as "uuids",
             array['a','b']::text[] as "texts", 'reading'::skill as "skill"
    `.execute(db);
    const row = sample.rows[0] ?? {};
    expect(row.numeric).toBe('0.500');
    expect(row.real).toBe(1.5);
    expect(row.smallint).toBe(7);
    expect(row.date).toBeInstanceOf(Date);
    expect(Array.isArray(row.uuids) && typeof row.uuids[0] === 'string').toBe(true);
    expect(row.texts).toEqual(['a', 'b']);
    expect(row.skill).toBe('reading');
  });

  it('throws an error naming the fix when the login user may not become stufen_app', async (ctx) => {
    const me = await sql<{ rolsuper: boolean }>`
      select rolsuper from pg_roles where rolname = current_user
    `.execute(db);
    // Standing in for a login user without the grant needs a superuser.
    if (!me.rows[0]?.rolsuper) return ctx.skip();

    const outsider = `p024_outsider_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await sql`create role ${sql.id(outsider)} nologin`.execute(db);
    const asOutsider = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: url, max: 1 }),
        onCreateConnection: async (connection) => {
          await connection.executeQuery(
            CompiledQuery.raw(`set session authorization "${outsider}"`),
          );
        },
      }),
    });
    try {
      let ran = false;
      const attempt = withUser(asOutsider, userA, async () => {
        ran = true;
      });
      await expect(attempt).rejects.toThrow(`grant stufen_app to "${outsider}"`);
      expect(ran).toBe(false);
    } finally {
      await asOutsider.destroy();
      await sql`drop role ${sql.id(outsider)}`.execute(db);
    }
  });

  // ---------------------------------------------------------------
  // 0003_policy_fixes.sql
  // ---------------------------------------------------------------

  it('users: a learner reads only the own row, signed out reads none', async () => {
    const ids = (userId: string | null) =>
      withUser(db, userId, async (trx) => {
        const rows = await trx.selectFrom('users').select('id').execute();
        return rows.map((row) => row.id);
      });
    expect(await ids(userA)).toEqual([userA]);
    expect(await ids(userB)).toEqual([userB]);
    expect(await ids(null)).toEqual([]);
  });

  it('users: a learner cannot insert, update or delete users', async () => {
    const insert = await outcome(userA, async (trx) => {
      const result = await trx
        .insertInto('users')
        .values({ email: `p029-${randomUUID()}@example.test`, name: 'Intruder' })
        .executeTakeFirst();
      return Number(result.numInsertedOrUpdatedRows ?? 0);
    });
    const update = await outcome(userA, async (trx) => {
      const result = await trx
        .updateTable('users')
        .set({ name: 'Renamed' })
        .where('id', '=', userA)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    });
    const remove = await outcome(userA, async (trx) => {
      const result = await trx.deleteFrom('users').where('id', '=', userA).executeTakeFirst();
      return Number(result.numDeletedRows);
    });
    expect([insert, update, remove]).toEqual(['denied', 'denied', 'denied']);

    const stillThere = await db
      .selectFrom('users')
      .select('name')
      .where('id', '=', userA)
      .execute();
    expect(stillThere).toEqual([{ name: 'Test A' }]);
  });

  it('schema_migrations is out of reach for a learner', async () => {
    const read = await outcome(userA, async (trx) => {
      const result = await sql`select filename from schema_migrations`.execute(trx);
      return result.rows.length;
    });
    expect(read).toBe('denied');
  });

  it('events: an anonymous insert works, another user id is refused', async () => {
    const name = `p029.test.${randomUUID().slice(0, 8)}`;
    const insertAs = (userId: string | null, eventUser: string | null) =>
      outcome(userId, async (trx) => {
        const result = await trx
          .insertInto('events')
          .values({ user_id: eventUser, name, props: {} })
          .executeTakeFirst();
        return Number(result.numInsertedOrUpdatedRows ?? 0);
      });
    try {
      expect(await insertAs(null, null)).toBe(1);
      expect(await insertAs(userA, null)).toBe(1);
      expect(await insertAs(userA, userA)).toBe(1);
      expect(await insertAs(userA, userB)).toBe('denied');
      expect(await insertAs(null, userB)).toBe('denied');

      const stored = await db
        .selectFrom('events')
        .select('user_id')
        .where('name', '=', name)
        .execute();
      expect(stored.map((row) => row.user_id).sort()).toEqual([userA, null, null].sort());
    } finally {
      await db.deleteFrom('events').where('name', '=', name).execute();
    }
  });

  it('feature_flags: updated_at moves when the owner changes a row', async () => {
    const key = `p029-${randomUUID().slice(0, 8)}`;
    try {
      await db.insertInto('feature_flags').values({ key, enabled: false }).execute();
      const before = await db
        .selectFrom('feature_flags')
        .select('updated_at')
        .where('key', '=', key)
        .executeTakeFirstOrThrow();
      await new Promise((resolve) => setTimeout(resolve, 25));
      await db.updateTable('feature_flags').set({ enabled: true }).where('key', '=', key).execute();
      const after = await db
        .selectFrom('feature_flags')
        .select('updated_at')
        .where('key', '=', key)
        .executeTakeFirstOrThrow();
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    } finally {
      await db.deleteFrom('feature_flags').where('key', '=', key).execute();
    }
  });

  // ---------------------------------------------------------------
  // 0004_daily_usage.sql
  // ---------------------------------------------------------------

  it('daily_usage: counts the own usage per local day and hides it from others', async () => {
    const conversation = randomUUID();
    try {
      // Owner work stands in for the boxes that write these rows.
      await db
        .insertInto('tutor_conversations')
        .values({ id: conversation, user_id: userA, language_code: 'de', level: 'A1' })
        .execute();
      await db
        .insertInto('tutor_messages')
        .values([
          { conversation_id: conversation, role: 'user', content: 'Hallo' },
          { conversation_id: conversation, role: 'assistant', content: 'Guten Tag' },
          { conversation_id: conversation, role: 'user', content: 'Wie geht es?' },
        ])
        .execute();
      await db
        .insertInto('writing_submissions')
        .values({
          user_id: userA,
          language_code: 'de',
          prompt: 'Stell dich vor.',
          text: 'Ich bin A.',
          target_level: 'A1',
        })
        .execute();
      await db
        .insertInto('speech_recordings')
        .values({ user_id: userA, duration_ms: 90_000 })
        .execute();

      const usageSeenBy = (userId: string | null) =>
        withUser(db, userId, (trx) =>
          trx
            .withTables<Views>()
            .selectFrom('daily_usage')
            .select(['user_id', 'day', 'tutor_messages', 'writing_grades', 'speech_minutes'])
            .execute(),
        );

      const own = await usageSeenBy(userA);
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({
        user_id: userA,
        tutor_messages: 2,
        writing_grades: 1,
        speech_minutes: 2,
      });
      expect(own[0]?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(await usageSeenBy(userB)).toEqual([]);
      expect(await usageSeenBy(null)).toEqual([]);
    } finally {
      await db.deleteFrom('speech_recordings').where('user_id', '=', userA).execute();
      await db.deleteFrom('writing_submissions').where('user_id', '=', userA).execute();
      await db.deleteFrom('tutor_conversations').where('id', '=', conversation).execute();
    }
  });

  it('daily_usage: an unknown time zone falls back to UTC instead of failing', async () => {
    try {
      await db
        .updateTable('profiles')
        .set({ timezone: 'Not/AZone' })
        .where('id', '=', userB)
        .execute();
      await db.insertInto('speech_recordings').values({ user_id: userB, duration_ms: 1 }).execute();
      const rows = await withUser(db, userB, (trx) =>
        trx.withTables<Views>().selectFrom('daily_usage').select(['speech_minutes']).execute(),
      );
      expect(rows).toEqual([{ speech_minutes: 1 }]);
    } finally {
      await db.deleteFrom('speech_recordings').where('user_id', '=', userB).execute();
      await db.updateTable('profiles').set({ timezone: 'UTC' }).where('id', '=', userB).execute();
    }
  });

  // ---------------------------------------------------------------
  // 0005_phase1_fixes.sql
  // ---------------------------------------------------------------

  it('ensure_profile: a learner may ensure only the own profile, the owner any', async () => {
    const own = await outcome(userA, async (trx) => {
      await sql`select ensure_profile(${userA}::uuid)`.execute(trx);
      return 1;
    });
    const other = await outcome(userA, async (trx) => {
      await sql`select ensure_profile(${userB}::uuid)`.execute(trx);
      return 1;
    });
    const signedOut = await outcome(null, async (trx) => {
      await sql`select ensure_profile(${userB}::uuid)`.execute(trx);
      return 1;
    });
    expect([own, other, signedOut]).toEqual([1, 'denied', 'denied']);
    // Owner work is not restricted.
    await sql`select ensure_profile(${userB}::uuid)`.execute(db);
  });

  it('entitlements: a new row holds no limits of its own', async () => {
    const row = await db
      .selectFrom('entitlements')
      .select(['plan', 'limits'])
      .where('user_id', '=', userA)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ plan: 'free_beta', limits: {} });
  });

  it('cando_outcomes: a learner writes and reads only own rows', async () => {
    const candoId = randomUUID();
    try {
      await db
        .insertInto('cando_descriptors')
        .values({
          id: candoId,
          language_code: 'de',
          level: 'A1',
          skill: 'reading',
          code: `P145.${candoId.slice(0, 8)}`,
          text_en: 'Test descriptor',
        })
        .execute();

      const insertFor = (actor: string, owner: string) =>
        outcome(actor, async (trx) => {
          const result = await trx
            .insertInto('cando_outcomes')
            .values({ user_id: owner, cando_id: candoId, correct: true, exercise_type: 'cloze' })
            .executeTakeFirst();
          return Number(result.numInsertedOrUpdatedRows ?? 0);
        });
      expect(await insertFor(userA, userA)).toBe(1);
      expect(await insertFor(userA, userB)).toBe('denied');

      const seenBy = (userId: string | null) =>
        withUser(db, userId, (trx) =>
          trx
            .selectFrom('cando_outcomes')
            .select('user_id')
            .where('cando_id', '=', candoId)
            .execute(),
        );
      expect(await seenBy(userA)).toEqual([{ user_id: userA }]);
      expect(await seenBy(userB)).toEqual([]);
      expect(await seenBy(null)).toEqual([]);
    } finally {
      await db.deleteFrom('cando_descriptors').where('id', '=', candoId).execute();
    }
  });

  it('review_cards: the scheduler columns exist with defaults', async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'review_cards' and column_name in ('scheduled_days', 'learning_steps')
      order by column_name
    `.execute(db);
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'learning_steps',
      'scheduled_days',
    ]);
  });
});
