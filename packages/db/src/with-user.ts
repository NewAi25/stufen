// The per user transaction helper. Every request that touches learner data
// goes through withUser, so the row level security policies in the migrations
// see who is asking.

import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from './schema';

/** The role the policies in migration 0001 are granted to. */
export const APP_ROLE = 'stufen_app';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the 8-4-4-4-12 hex form Postgres prints for a uuid. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * Turns a failed `set local role stufen_app` into a message that names the
 * fix. Any other failure is returned unchanged.
 */
function explainRoleError(error: unknown, login: string): unknown {
  const code = errorCode(error);
  const text = error instanceof Error ? error.message : '';
  // 42501 insufficient_privilege: the login user is not a member of the role.
  if (code === '42501') {
    return new Error(
      `withUser: database user "${login}" may not switch to role "${APP_ROLE}", so row level security cannot be enforced. ` +
        `Fix: run \`grant ${APP_ROLE} to "${login}"\` once as a superuser, or connect as ${APP_ROLE} itself.`,
      { cause: error },
    );
  }
  // 22023 invalid_parameter_value: Postgres reports an unknown role this way.
  if (code === '22023' && text.includes('does not exist')) {
    return new Error(
      `withUser: role "${APP_ROLE}" does not exist in this database. ` +
        `Fix: apply the migrations (pnpm db:migrate); 0001_init.sql creates the role. ` +
        `Then run \`grant ${APP_ROLE} to "${login}"\` if "${login}" is not a superuser.`,
      { cause: error },
    );
  }
  return error;
}

/**
 * Runs fn inside one transaction as the given user.
 *
 * Before fn runs, the transaction does two things:
 *   1. `select set_config('app.user_id', $1, true)` with the user id, or an
 *      empty string when userId is null (nobody signed in). The policies read
 *      this value.
 *   2. `set local role stufen_app`. Policies are granted to that role only,
 *      and a table owner or superuser skips row level security, so without
 *      this step the policies would not apply to the migration user.
 *
 * Both settings are transaction local. They vanish at commit or rollback, so
 * nothing leaks to the next request on a pooled connection.
 *
 * Throws a TypeError before opening a transaction when userId is neither null
 * nor a uuid. Throws an Error that names the fix when the connecting user may
 * not switch to stufen_app. When fn throws, the transaction rolls back and the
 * error is passed on.
 */
export async function withUser<T>(
  db: Kysely<DB>,
  userId: string | null,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  if (userId !== null && !isUuid(userId)) {
    throw new TypeError(
      'withUser: userId must be a uuid string, or null for a request with nobody signed in',
    );
  }
  return db.transaction().execute(async (trx) => {
    const who = await sql<{ login: string }>`
      select set_config('app.user_id', ${userId ?? ''}, true) as user_id, session_user as login
    `.execute(trx);
    try {
      await sql`set local role stufen_app`.execute(trx);
    } catch (error) {
      throw explainRoleError(error, who.rows[0]?.login ?? 'the login user');
    }
    return fn(trx);
  });
}
