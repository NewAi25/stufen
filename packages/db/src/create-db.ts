// Connection factory. No relative imports with a runtime effect (see
// migrate.ts for why); the DB type is import type only, which Node strips.

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

/** One Kysely instance over a pg Pool. Call db.destroy() when the process ends. */
export function createDb(url: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  });
}
