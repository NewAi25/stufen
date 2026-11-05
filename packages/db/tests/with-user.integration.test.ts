// Integration test. Needs a real PostgreSQL with the migrations applied and is
// skipped when DATABASE_URL is not set. See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/db test
//
// It creates two users, checks what each of them can see through withUser,
// and deletes them again. Nothing else in the database is changed.

import { randomUUID } from 'node:crypto';
import { CompiledQuery, Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withUser } from '../src/index';
import type { DB } from '../src/index';

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
    // profiles and entitlements go with the users (on delete cascade).
    await db.deleteFrom('users').where('id', 'in', [userA, userB]).execute();
    await db.destroy();
  });

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
    expect(entitlement.limits).toMatchObject({ tutor_messages_per_day: 200 });

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
});
