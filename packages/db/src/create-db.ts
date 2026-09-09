// Connection factory and the per user transaction helper. No relative imports
// with a runtime effect (see migrate.ts for why); the DB type is import type
// only, which Node strips.

import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

/** One Kysely instance over a pg Pool. Call db.destroy() when the process ends. */
export function createDb(url: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  });
}

/**
 * Runs fn inside a transaction after setting app.user_id for that transaction,
 * so the row level security policies in the migrations see the caller.
 * Boxes still check the user id themselves; this is the second lock.
 */
export async function withUser<T>(
  db: Kysely<DB>,
  userId: string,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.user_id', ${userId}, true)`.execute(trx);
    return fn(trx);
  });
}
