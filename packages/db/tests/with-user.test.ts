// Unit test, no database. A recording driver stands in for Postgres so the
// order of statements, the rollback and the error messages can be checked.
// The real row level security check is tests/with-user.integration.test.ts.

import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import { describe, expect, it } from 'vitest';
import { withUser } from '../src/index';
import type { DB } from '../src/index';

const USER_A = '0b0f6a52-3c1e-4d1f-9a55-2f6d1c0e7a11';

interface Fake {
  db: Kysely<DB>;
  /** Every statement the driver saw, with begin, commit and rollback markers. */
  log: string[];
  /** Parameters of each statement, in the same order as the queries in log. */
  params: unknown[][];
}

/** failOn: a statement containing this text rejects with the given error. */
function fakeDb(failOn?: { text: string; error: Error }): Fake {
  const log: string[] = [];
  const params: unknown[][] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      const text = query.sql.replace(/\s+/g, ' ').trim();
      log.push(text);
      params.push([...query.parameters]);
      if (failOn && text.includes(failOn.text)) throw failOn.error;
      const rows: unknown[] = text.includes('session_user') ? [{ login: 'stufen_login' }] : [];
      return { rows: rows as R[] };
    },
    // eslint-disable-next-line require-yield
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('streamQuery is not used in this test');
    },
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {
      log.push('begin');
    },
    async commitTransaction() {
      log.push('commit');
    },
    async rollbackTransaction() {
      log.push('rollback');
    },
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db, log, params };
}

function pgError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('withUser', () => {
  it('sets app.user_id, switches to stufen_app, runs fn, then commits', async () => {
    const { db, log, params } = fakeDb();
    const result = await withUser(db, USER_A, async (trx) => {
      await trx.selectFrom('profiles').select('id').execute();
      return 'done';
    });
    expect(result).toBe('done');
    expect(log).toEqual([
      'begin',
      "select set_config('app.user_id', $1, true) as user_id, session_user as login",
      'set local role stufen_app',
      'select "id" from "profiles"',
      'commit',
    ]);
    expect(params[0]).toEqual([USER_A]);
  });

  it('sends an empty string when nobody is signed in', async () => {
    const { db, log, params } = fakeDb();
    await withUser(db, null, async () => undefined);
    expect(params[0]).toEqual(['']);
    expect(log).toContain('set local role stufen_app');
  });

  it.each([
    ['an empty string', ''],
    ['a name', 'manisha'],
    ['a uuid without hyphens', '0b0f6a523c1e4d1f9a552f6d1c0e7a11'],
    ['a uuid with trailing SQL', `${USER_A}'; drop table users; --`],
    ['a uuid with a newline after it', `${USER_A}\n`],
  ])('rejects %s before opening a transaction', async (_label, bad) => {
    const { db, log } = fakeDb();
    await expect(withUser(db, bad, async () => 'never')).rejects.toThrow(TypeError);
    await expect(withUser(db, bad, async () => 'never')).rejects.toThrow(/must be a uuid/);
    expect(log).toEqual([]);
  });

  it('rejects a value that is not a string, even if the types were bypassed', async () => {
    const { db, log } = fakeDb();
    const notAString = 42 as unknown as string;
    await expect(withUser(db, notAString, async () => 'never')).rejects.toThrow(/must be a uuid/);
    expect(log).toEqual([]);
  });

  it('accepts an upper case uuid', async () => {
    const { db, params } = fakeDb();
    await withUser(db, USER_A.toUpperCase(), async () => undefined);
    expect(params[0]).toEqual([USER_A.toUpperCase()]);
  });

  it('rolls back and passes the error on when fn throws', async () => {
    const { db, log } = fakeDb();
    await expect(
      withUser(db, USER_A, async () => {
        throw new Error('box failed');
      }),
    ).rejects.toThrow('box failed');
    expect(log.at(-1)).toBe('rollback');
    expect(log).not.toContain('commit');
  });

  it('names the fix when the login user may not switch to stufen_app', async () => {
    const denied = pgError('42501', 'permission denied to set role "stufen_app"');
    const { db, log } = fakeDb({ text: 'set local role', error: denied });
    let ran = false;
    const attempt = withUser(db, USER_A, async () => {
      ran = true;
    });
    await expect(attempt).rejects.toThrow('grant stufen_app to "stufen_login"');
    await expect(attempt).rejects.toThrow(/row level security cannot be enforced/);
    await expect(attempt).rejects.toHaveProperty('cause', denied);
    expect(ran).toBe(false);
    expect(log.at(-1)).toBe('rollback');
  });

  it('names the fix when the role does not exist yet', async () => {
    const missing = pgError('22023', 'role "stufen_app" does not exist');
    const { db } = fakeDb({ text: 'set local role', error: missing });
    const attempt = withUser(db, USER_A, async () => undefined);
    await expect(attempt).rejects.toThrow(/apply the migrations/);
    await expect(attempt).rejects.toHaveProperty('cause', missing);
  });

  it('passes any other database error on unchanged', async () => {
    const other = pgError('57P01', 'terminating connection due to administrator command');
    const { db } = fakeDb({ text: 'set local role', error: other });
    await expect(withUser(db, USER_A, async () => undefined)).rejects.toBe(other);
  });
});
