// Postgres adapter for the AuthStore port (P1-37, ADR-009).
//
// Tokens are hashed at rest. The service hands this adapter raw session and
// magic link tokens; every one is turned into its SHA-256 hash (hex) before it
// goes into a statement, so `sessions.token` and `verifications.identifier`
// only ever hold hashes. The raw token exists in the cookie and in the email
// and nowhere in the database. Someone who can read these tables (a leaked
// backup, a stray select) gets nothing that signs in. A plain unsalted hash
// is enough because a token is 32 random bytes, not a guessable password.
//
// Lookups compare hashes. That is safe against timing because the hash of an
// attacker's guess is unpredictable, so how far a comparison got reveals nothing useful.
//
// Access model: all of this is owner work on `db` directly, never withUser.
// `sessions` and `verifications` are owner only by design: the role
// stufen_app has no grant and no policy on them (0002_auth.sql), so nothing
// that runs for a learner can read a session or a link.
//
// Magic link tokens live in `verifications`, which has only identifier, value
// and expires_at. identifier is `magic-link:<hash>`, value is JSON text with
// the email and redirectTo. A used link is deleted, not flagged.
import { createHash } from 'node:crypto';
import { sql } from '@stufen/db';
import type { Database, Row } from '@stufen/db';
import type { AuthLinkToken, AuthStore, AuthUser } from './store';

const LINK_PREFIX = 'magic-link:';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SHA-256 of the raw token as 64 hex characters. The only form a token is stored in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** The `verifications.identifier` of a magic link token. */
export function linkIdentifier(token: string): string {
  return LINK_PREFIX + hashToken(token);
}

function userFromRow(row: Row<'users'>): AuthUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

/** What `verifications.value` holds for a magic link. Never the token. */
interface LinkValue {
  email: string;
  redirectTo: string;
}

/** Reads the JSON text back. Null for anything that is not what insertLinkToken wrote. */
function parseLinkValue(value: string): LinkValue | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('email' in parsed) || !('redirectTo' in parsed)) return null;
  const { email, redirectTo } = parsed;
  if (typeof email !== 'string' || typeof redirectTo !== 'string') return null;
  return { email, redirectTo };
}

/** The port plus two clean up statements for a later scheduled job. */
export type PostgresAuthStore = AuthStore & {
  /** Deletes sessions whose expires_at is at or before `now`. Returns how many. */
  deleteExpiredSessions(now: Date): Promise<number>;
  /** Deletes magic link rows whose expires_at is at or before `now`. Returns how many. */
  deleteExpiredLinkTokens(now: Date): Promise<number>;
};

/**
 * AuthStore on PostgreSQL. `db` is the handle from createDb, used as the
 * owner. User ids must be uuids, which is what createAuth generates.
 */
export function createPostgresAuthStore(db: Database): PostgresAuthStore {
  return {
    async createUserIfAbsent(user) {
      // users.email is unique by exact text. One mailbox must be one user, so
      // an address that is not already trimmed and lower cased is refused
      // here instead of becoming a second account.
      if (user.email !== user.email.trim().toLowerCase()) {
        throw new Error('createUserIfAbsent: the email must be trimmed and lower cased');
      }
      return db.transaction().execute(async (trx) => {
        // Two calls racing for one new email: the second insert waits on the
        // unique index until the first commits, then inserts nothing.
        const inserted = await trx
          .insertInto('users')
          .values({
            id: user.id,
            email: user.email,
            email_verified: user.emailVerified,
            name: user.name,
            created_at: user.createdAt,
          })
          .onConflict((conflict) => conflict.column('email').doNothing())
          .returningAll()
          .executeTakeFirst();
        if (inserted) {
          // Same transaction, so the profile and the entitlement exist before
          // anyone can see the user. Owner work: ensure_profile only restricts
          // the role stufen_app (0005_phase1_fixes.sql).
          await sql`select ensure_profile(${inserted.id}::uuid)`.execute(trx);
          return { user: userFromRow(inserted), created: true };
        }
        const existing = await trx
          .selectFrom('users')
          .selectAll()
          .where('email', '=', user.email)
          .executeTakeFirst();
        if (!existing) {
          // Only if the other user was deleted between the two statements.
          throw new Error('createUserIfAbsent: the user vanished during sign in; try again');
        }
        return { user: userFromRow(existing), created: false };
      });
    },

    async findUserById(userId) {
      // Anything that is not a uuid cannot be a user; asking Postgres would throw.
      if (!UUID.test(userId)) return null;
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirst();
      return row ? userFromRow(row) : null;
    },

    async markEmailVerified(userId) {
      if (!UUID.test(userId)) return;
      await db
        .updateTable('users')
        .set({ email_verified: true })
        .where('id', '=', userId)
        .where('email_verified', '=', false)
        .execute();
    },

    async insertSession(session) {
      await db
        .insertInto('sessions')
        .values({
          token: hashToken(session.token),
          user_id: session.userId,
          expires_at: session.expiresAt,
        })
        .execute();
    },

    async findSession(token) {
      const row = await db
        .selectFrom('sessions')
        .select(['user_id', 'expires_at'])
        .where('token', '=', hashToken(token))
        .executeTakeFirst();
      if (!row) return null;
      // The raw token is the one the caller holds; the table never had it.
      return { token, userId: row.user_id, expiresAt: row.expires_at.toISOString() };
    },

    async deleteSession(token) {
      await db.deleteFrom('sessions').where('token', '=', hashToken(token)).execute();
    },

    async deleteExpiredSessions(now) {
      const result = await db
        .deleteFrom('sessions')
        .where('expires_at', '<=', now)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async insertLinkToken(link) {
      // A link that arrives already used is never findable, so nothing is stored.
      if (link.usedAt !== null) return;
      const value: LinkValue = { email: link.email, redirectTo: link.redirectTo };
      await db
        .insertInto('verifications')
        .values({
          identifier: linkIdentifier(link.token),
          value: JSON.stringify(value),
          expires_at: link.expiresAt,
        })
        .execute();
    },

    async findLinkToken(token): Promise<AuthLinkToken | null> {
      const row = await db
        .selectFrom('verifications')
        .select(['value', 'expires_at'])
        .where('identifier', '=', linkIdentifier(token))
        .executeTakeFirst();
      if (!row) return null;
      const value = parseLinkValue(row.value);
      // A row this adapter did not write is treated as an unknown token.
      if (!value) return null;
      return {
        token,
        email: value.email,
        redirectTo: value.redirectTo,
        expiresAt: row.expires_at.toISOString(),
        usedAt: null,
      };
    },

    async markLinkTokenUsed(token) {
      // Single use is this one statement. Two consumes racing for the same row
      // both try to delete it; Postgres lets one through, the other waits on
      // the row lock, then finds the row gone and deletes nothing. So exactly
      // one call gets a row back.
      const deleted = await db
        .deleteFrom('verifications')
        .where('identifier', '=', linkIdentifier(token))
        .returning('id')
        .execute();
      return deleted.length > 0;
    },

    async deleteExpiredLinkTokens(now) {
      // Only rows this adapter wrote; `verifications` may hold other kinds later.
      const result = await db
        .deleteFrom('verifications')
        .where('identifier', 'like', `${LINK_PREFIX}%`)
        .where('expires_at', '<=', now)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}
