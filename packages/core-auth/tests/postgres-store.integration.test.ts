// Integration test for the Postgres adapter and for createAuth on top of it.
// Needs a real PostgreSQL with the migrations applied and is skipped when
// DATABASE_URL is not set. See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen@localhost:5497/stufen_auth pnpm --filter @stufen/core-auth test
//
// Every user it creates has a fresh uuid and a unique @example.test address.
// At the end it deletes exactly those users (the delete cascades to sessions,
// profiles and entitlements) and exactly the verification rows it wrote.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { MailMessage, MailPort } from '@stufen/contracts';
import { createDb, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { AuthError, createAuth, createPostgresAuthStore } from '../src/index';
import type { AuthOptions, AuthStore, PostgresAuthStore } from '../src/index';
import { hashToken, linkIdentifier } from '../src/postgres-store';
import { runAuthStoreContract } from './store-contract';

const url = process.env.DATABASE_URL;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const HASH = /^[0-9a-f]{64}$/;

describe.skipIf(!url)('Postgres AuthStore on a real Postgres', () => {
  const createdUsers = new Set<string>();
  const writtenIdentifiers = new Set<string>();
  let db: Database;
  let store: PostgresAuthStore;

  /** The store, remembering every user and link row it writes for the clean up. */
  function tracked(inner: AuthStore): AuthStore {
    return {
      ...inner,
      async createUserIfAbsent(user) {
        const result = await inner.createUserIfAbsent(user);
        createdUsers.add(result.user.id);
        return result;
      },
      async insertLinkToken(link) {
        writtenIdentifiers.add(linkIdentifier(link.token));
        await inner.insertLinkToken(link);
      },
    };
  }

  beforeAll(() => {
    db = createDb(url as string);
    store = createPostgresAuthStore(db);
  });

  afterAll(async () => {
    if (writtenIdentifiers.size > 0) {
      await db
        .deleteFrom('verifications')
        .where('identifier', 'in', [...writtenIdentifiers])
        .execute();
    }
    if (createdUsers.size > 0) {
      await db
        .deleteFrom('users')
        .where('id', 'in', [...createdUsers])
        .execute();
    }
    await db.destroy();
  });

  runAuthStoreContract('Postgres', () => tracked(store));

  // ---------- helpers for the flow tests ----------

  const uniqueEmail = () => `p137-${randomUUID()}@example.test`;

  /** createAuth on the Postgres store with a recording mail port and the real bus. */
  function setup(overrides: Partial<AuthOptions> = {}) {
    const sent: MailMessage[] = [];
    const mail: MailPort = {
      async send(message) {
        sent.push(message);
        return { messageId: `m${sent.length}` };
      },
    };
    const bus = createEventBus();
    const signedUp = vi.fn(async () => {});
    bus.on('user.signed_up', signedUp);
    const clock = { offsetMs: 0 };
    const auth = createAuth({
      store: tracked(store),
      mail,
      bus,
      now: () => new Date(Date.now() + clock.offsetMs),
      env: {},
      ...overrides,
    });
    return { auth, sent, signedUp, clock };
  }

  /** Pulls the token out of the last mail, the way a learner clicking the link would. */
  function tokenFromLastMail(sent: MailMessage[]): string {
    const match = /[?&]token=([^\s&#]+)/.exec(sent.at(-1)?.text ?? '');
    if (!match?.[1]) throw new Error('no token in the mail text');
    return match[1];
  }

  /** How many rows of sessions or verifications contain the text anywhere a token could sit. */
  async function rowsContaining(text: string): Promise<number> {
    const pattern = `%${text}%`;
    const inSessions = await db
      .selectFrom('sessions')
      .select('id')
      .where('token', 'like', pattern)
      .execute();
    const inVerifications = await db
      .selectFrom('verifications')
      .select('id')
      .where((eb) => eb.or([eb('identifier', 'like', pattern), eb('value', 'like', pattern)]))
      .execute();
    return inSessions.length + inVerifications.length;
  }

  /** The value, or a failed test when it is null or undefined. */
  function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error('expected a value, got none');
    return value;
  }

  const sessionRowsOf = (userId: string) =>
    db.selectFrom('sessions').selectAll().where('user_id', '=', userId).execute();

  // ---------- the whole flow through createAuth ----------

  describe('createAuth on the Postgres store', () => {
    it('request, consume, getSession: one user, one event, a profile, and no raw token at rest', async () => {
      const { auth, sent, signedUp } = setup();
      const email = uniqueEmail();

      await expect(
        auth.requestMagicLink(`  ${email.toUpperCase()} `, '/auth/callback'),
      ).resolves.toEqual({ sent: true });

      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe(email);
      const linkToken = tokenFromLastMail(sent);
      // While the link is pending: only its hash is stored, and no user yet.
      expect(await rowsContaining(linkToken)).toBe(0);
      const pending = await db
        .selectFrom('verifications')
        .selectAll()
        .where('identifier', '=', `magic-link:${hashToken(linkToken)}`)
        .execute();
      expect(pending).toHaveLength(1);
      expect(JSON.parse(pending[0]?.value ?? '')).toEqual({ email, redirectTo: '/auth/callback' });
      const before = await db.selectFrom('users').select('id').where('email', '=', email).execute();
      expect(before).toHaveLength(0);

      const session = await auth.consumeMagicLink(linkToken);

      expect(session).not.toBeNull();
      if (!session) return;
      expect(session.email).toBe(email);
      await expect(auth.getSession(session.sessionToken)).resolves.toEqual(session);

      expect(signedUp).toHaveBeenCalledTimes(1);
      expect(signedUp).toHaveBeenCalledWith({ userId: session.userId });

      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', session.userId)
        .executeTakeFirst();
      expect(user).toMatchObject({ email, email_verified: true });
      const profiles = await db
        .selectFrom('profiles')
        .select('id')
        .where('id', '=', session.userId)
        .execute();
      const entitlements = await db
        .selectFrom('entitlements')
        .select('user_id')
        .where('user_id', '=', session.userId)
        .execute();
      expect(profiles).toHaveLength(1);
      expect(entitlements).toHaveLength(1);

      // Neither raw token is anywhere in sessions or verifications.
      expect(await rowsContaining(linkToken)).toBe(0);
      expect(await rowsContaining(session.sessionToken)).toBe(0);
      const rows = await sessionRowsOf(session.userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.token).toMatch(HASH);
      expect(rows[0]?.token).toBe(hashToken(session.sessionToken));
      expect(rows[0]?.expires_at.toISOString()).toBe(session.expiresAt);
      // The used link row is gone.
      const after = await db
        .selectFrom('verifications')
        .select('id')
        .where('identifier', '=', linkIdentifier(linkToken))
        .execute();
      expect(after).toHaveLength(0);
    });

    it('a second consume returns null and changes nothing', async () => {
      const { auth, sent, signedUp } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
      const linkToken = tokenFromLastMail(sent);
      const session = must(await auth.consumeMagicLink(linkToken));

      await expect(auth.consumeMagicLink(linkToken)).resolves.toBeNull();

      expect(signedUp).toHaveBeenCalledTimes(1);
      expect(await sessionRowsOf(session.userId)).toHaveLength(1);
    });

    it('two consumes at the same moment produce one session', async () => {
      const { auth, sent, signedUp } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
      const linkToken = tokenFromLastMail(sent);

      const results = await Promise.all([
        auth.consumeMagicLink(linkToken),
        auth.consumeMagicLink(linkToken),
        auth.consumeMagicLink(linkToken),
      ]);

      const sessions = results.filter((result) => result !== null);
      expect(sessions).toHaveLength(1);
      expect(signedUp).toHaveBeenCalledTimes(1);
      expect(await sessionRowsOf(must(sessions[0]).userId)).toHaveLength(1);
    });

    it('an expired link returns null and creates no user', async () => {
      const { auth, sent, signedUp, clock } = setup();
      const email = uniqueEmail();
      await auth.requestMagicLink(email, '/auth/callback');
      const linkToken = tokenFromLastMail(sent);

      clock.offsetMs = 15 * MINUTE + 1000;

      await expect(auth.consumeMagicLink(linkToken)).resolves.toBeNull();
      expect(signedUp).not.toHaveBeenCalled();
      const users = await db.selectFrom('users').select('id').where('email', '=', email).execute();
      expect(users).toHaveLength(0);
    });

    it('an unknown link token returns null', async () => {
      const { auth } = setup();

      await expect(auth.consumeMagicLink(randomBytes(32).toString('hex'))).resolves.toBeNull();
      await expect(auth.consumeMagicLink('')).resolves.toBeNull();
    });

    it('signOut removes the session row', async () => {
      const { auth, sent } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
      const session = must(await auth.consumeMagicLink(tokenFromLastMail(sent)));

      await auth.signOut(session.sessionToken);
      await auth.signOut(session.sessionToken);

      await expect(auth.getSession(session.sessionToken)).resolves.toBeNull();
      expect(await sessionRowsOf(session.userId)).toHaveLength(0);
    });

    it('an expired session returns null and its row is deleted', async () => {
      const { auth, sent, clock } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
      const session = must(await auth.consumeMagicLink(tokenFromLastMail(sent)));

      clock.offsetMs = 30 * DAY + MINUTE;

      await expect(auth.getSession(session.sessionToken)).resolves.toBeNull();
      expect(await sessionRowsOf(session.userId)).toHaveLength(0);
    });

    it('a second sign in reuses the user, emits nothing new and gives a second session', async () => {
      const { auth, sent, signedUp } = setup();
      const email = uniqueEmail();
      await auth.requestMagicLink(email, '/auth/callback');
      const first = must(await auth.consumeMagicLink(tokenFromLastMail(sent)));
      await auth.requestMagicLink(email, '/auth/callback');
      const second = must(await auth.consumeMagicLink(tokenFromLastMail(sent)));

      expect(second.userId).toBe(first.userId);
      expect(second.sessionToken).not.toBe(first.sessionToken);
      expect(signedUp).toHaveBeenCalledTimes(1);
      expect(await sessionRowsOf(first.userId)).toHaveLength(2);
      await expect(auth.getSession(first.sessionToken)).resolves.toEqual(first);
    });

    it('a token of the wrong kind opens nothing', async () => {
      const { auth, sent } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
      const linkToken = tokenFromLastMail(sent);

      // A link token is not a session, and neither is the hash of a real one.
      await expect(auth.getSession(linkToken)).resolves.toBeNull();
      const session = must(await auth.consumeMagicLink(linkToken));
      await expect(auth.getSession(hashToken(session.sessionToken))).resolves.toBeNull();
      await expect(auth.consumeMagicLink(session.sessionToken)).resolves.toBeNull();
    });

    it('createDevSession works outside production and is refused in production', async () => {
      const dev = setup();
      const session = await dev.auth.createDevSession(uniqueEmail(), 'Ada');
      await expect(dev.auth.getSession(session.sessionToken)).resolves.toEqual(session);

      const prod = setup({ env: { NODE_ENV: 'production' } });
      const email = uniqueEmail();
      const error = await prod.auth.createDevSession(email).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthError);
      const users = await db.selectFrom('users').select('id').where('email', '=', email).execute();
      expect(users).toHaveLength(0);
    });
  });

  // ---------- what the port does not show ----------

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

  async function signedIn() {
    const { auth, sent } = setup();
    await auth.requestMagicLink(uniqueEmail(), '/auth/callback');
    return must(await auth.consumeMagicLink(tokenFromLastMail(sent)));
  }

  describe('the app role cannot reach the auth tables', () => {
    it('inside withUser a learner cannot read sessions, not even the own one', async () => {
      const session = await signedIn();

      const outcome = await withUser(db, session.userId, (trx) =>
        trx.selectFrom('sessions').selectAll().execute(),
      ).then(
        (rows) => (rows.length === 0 ? 'empty' : 'rows visible'),
        (error: unknown) => errorCodeOf(Promise.reject(error)),
      );

      // 42501 is insufficient_privilege: no grant on the table.
      expect(['empty', '42501']).toContain(outcome);
      expect(await sessionRowsOf(session.userId)).toHaveLength(1);
    });

    it('inside withUser a learner cannot read pending links', async () => {
      const session = await signedIn();
      const { auth } = setup();
      await auth.requestMagicLink(uniqueEmail(), '/auth/callback');

      const outcome = await withUser(db, session.userId, (trx) =>
        trx.selectFrom('verifications').selectAll().execute(),
      ).then(
        (rows) => (rows.length === 0 ? 'empty' : 'rows visible'),
        (error: unknown) => errorCodeOf(Promise.reject(error)),
      );

      expect(['empty', '42501']).toContain(outcome);
    });

    it('inside withUser a learner sees the own users row and nobody else', async () => {
      const a = await signedIn();
      const b = await signedIn();

      const seen = await withUser(db, a.userId, (trx) =>
        trx.selectFrom('users').select(['id', 'email']).execute(),
      );

      expect(seen).toEqual([{ id: a.userId, email: a.email }]);
      expect(seen.some((row) => row.id === b.userId)).toBe(false);
    });

    it('inside withUser a learner cannot forge a session or delete one', async () => {
      const session = await signedIn();

      const forged = await errorCodeOf(
        withUser(db, session.userId, (trx) =>
          trx
            .insertInto('sessions')
            .values({
              user_id: session.userId,
              token: hashToken('forged'),
              expires_at: new Date(Date.now() + DAY),
            })
            .execute(),
        ),
      );
      const deleted = await errorCodeOf(
        withUser(db, session.userId, (trx) =>
          trx.deleteFrom('sessions').where('user_id', '=', session.userId).execute(),
        ),
      );

      expect(forged).toBe('42501');
      expect(['no error', '42501']).toContain(deleted);
      expect(await sessionRowsOf(session.userId)).toHaveLength(1);
    });
  });

  describe('adapter details', () => {
    const newUser = (email = uniqueEmail()) => ({
      id: randomUUID(),
      email,
      emailVerified: false,
      name: 'Ada',
      createdAt: new Date().toISOString(),
    });

    it('createUserIfAbsent creates the profile and the entitlement with the user', async () => {
      const user = newUser();

      await tracked(store).createUserIfAbsent(user);

      const profile = await db
        .selectFrom('profiles')
        .select(['id', 'display_name'])
        .where('id', '=', user.id)
        .executeTakeFirst();
      const entitlement = await db
        .selectFrom('entitlements')
        .select('user_id')
        .where('user_id', '=', user.id)
        .executeTakeFirst();
      expect(profile).toEqual({ id: user.id, display_name: 'Ada' });
      expect(entitlement).toEqual({ user_id: user.id });
    });

    it('refuses an email that is not trimmed and lower cased, and stores nothing', async () => {
      const user = newUser(`P137-${randomUUID()}@Example.Test`);

      await expect(tracked(store).createUserIfAbsent(user)).rejects.toThrow(/lower cased/);

      await expect(store.findUserById(user.id)).resolves.toBeNull();
    });

    it('deleteExpiredSessions removes sessions at or before the given time only', async () => {
      const user = newUser();
      await tracked(store).createUserIfAbsent(user);
      const edge = new Date(Date.now() - 60 * MINUTE);
      const old = { token: randomBytes(32).toString('hex'), userId: user.id };
      const live = { token: randomBytes(32).toString('hex'), userId: user.id };
      await store.insertSession({ ...old, expiresAt: edge.toISOString() });
      await store.insertSession({ ...live, expiresAt: new Date(Date.now() + DAY).toISOString() });

      await store.deleteExpiredSessions(new Date(edge.getTime() - 1));
      await expect(store.findSession(old.token)).resolves.not.toBeNull();

      await expect(store.deleteExpiredSessions(edge)).resolves.toBeGreaterThanOrEqual(1);
      await expect(store.findSession(old.token)).resolves.toBeNull();
      await expect(store.findSession(live.token)).resolves.not.toBeNull();
    });

    it('deleteExpiredLinkTokens removes expired links and leaves other rows alone', async () => {
      const edge = new Date(Date.now() - 60 * MINUTE);
      const link = { email: uniqueEmail(), redirectTo: '/auth/callback', usedAt: null };
      const old = { ...link, token: randomBytes(32).toString('hex') };
      const live = { ...link, token: randomBytes(32).toString('hex') };
      const otherKind = `p137-other-kind:${randomUUID()}`;
      writtenIdentifiers.add(otherKind);
      await tracked(store).insertLinkToken({ ...old, expiresAt: edge.toISOString() });
      await tracked(store).insertLinkToken({
        ...live,
        expiresAt: new Date(Date.now() + DAY).toISOString(),
      });
      await db
        .insertInto('verifications')
        .values({ identifier: otherKind, value: 'x', expires_at: edge })
        .execute();

      await expect(store.deleteExpiredLinkTokens(edge)).resolves.toBeGreaterThanOrEqual(1);

      await expect(store.findLinkToken(old.token)).resolves.toBeNull();
      await expect(store.findLinkToken(live.token)).resolves.not.toBeNull();
      const others = await db
        .selectFrom('verifications')
        .select('id')
        .where('identifier', '=', otherKind)
        .execute();
      expect(others).toHaveLength(1);
    });

    it('a verification row with a value this adapter did not write is an unknown token', async () => {
      const token = randomBytes(32).toString('hex');
      writtenIdentifiers.add(linkIdentifier(token));
      await db
        .insertInto('verifications')
        .values({
          identifier: linkIdentifier(token),
          value: 'not json',
          expires_at: new Date(Date.now() + DAY),
        })
        .execute();

      await expect(store.findLinkToken(token)).resolves.toBeNull();
    });
  });
});
