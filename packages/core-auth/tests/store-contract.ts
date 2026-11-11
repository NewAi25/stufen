// The behaviour every AuthStore adapter must show, written against the port
// only. Not a test file itself: store-contract.memory.test.ts runs it for the
// in memory store and postgres-store.integration.test.ts for Postgres.
//
// Every id is a fresh uuid and every email and token is unique per run, so the
// contract can run against a shared database without meeting old rows.
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AuthLinkToken, AuthStore, AuthUser } from '../src/index';

const CREATED_AT = '2026-11-11T08:00:00.000Z';
const LATER = '2099-01-01T00:00:00.000Z';
const LONG_AGO = '2001-01-01T00:00:00.000Z';

function newUser(overrides: Partial<AuthUser> = {}): AuthUser {
  const id = randomUUID();
  return {
    id,
    email: `contract-${id}@example.test`,
    emailVerified: false,
    name: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

const newToken = () => randomBytes(32).toString('hex');

function newLink(overrides: Partial<AuthLinkToken> = {}): AuthLinkToken {
  return {
    token: newToken(),
    email: `contract-${randomUUID()}@example.test`,
    redirectTo: '/auth/callback?next=%2Fsettings#top',
    expiresAt: LATER,
    usedAt: null,
    ...overrides,
  };
}

export function runAuthStoreContract(
  name: string,
  makeStore: () => AuthStore | Promise<AuthStore>,
): void {
  describe(`AuthStore contract: ${name}`, () => {
    let store: AuthStore;

    beforeAll(async () => {
      store = await makeStore();
    });

    describe('users', () => {
      it('createUserIfAbsent stores the user and returns it with created true', async () => {
        const user = newUser({ name: 'Ada' });

        const result = await store.createUserIfAbsent(user);

        expect(result).toEqual({ user, created: true });
        await expect(store.findUserById(user.id)).resolves.toEqual(user);
      });

      it('a second call for the same email returns created false and the first user', async () => {
        const first = newUser({ name: 'Ada' });
        await store.createUserIfAbsent(first);
        const second = newUser({ email: first.email, name: 'Someone else' });

        const result = await store.createUserIfAbsent(second);

        expect(result).toEqual({ user: first, created: false });
        await expect(store.findUserById(second.id)).resolves.toBeNull();
      });

      it('two concurrent calls for one email create exactly one user', async () => {
        const a = newUser();
        const b = newUser({ email: a.email });

        const results = await Promise.all([
          store.createUserIfAbsent(a),
          store.createUserIfAbsent(b),
        ]);

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results[0].user).toEqual(results[1].user);
        const winner = results[0].user.id;
        const loser = winner === a.id ? b.id : a.id;
        expect([a.id, b.id]).toContain(winner);
        await expect(store.findUserById(winner)).resolves.not.toBeNull();
        await expect(store.findUserById(loser)).resolves.toBeNull();
      });

      it('eight concurrent calls for one email still create exactly one user', async () => {
        const email = newUser().email;
        const users = Array.from({ length: 8 }, () => newUser({ email }));

        const results = await Promise.all(users.map((user) => store.createUserIfAbsent(user)));

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
      });

      it('findUserById returns null for an unknown id and for something that is no uuid', async () => {
        await expect(store.findUserById(randomUUID())).resolves.toBeNull();
        await expect(store.findUserById('not-a-uuid')).resolves.toBeNull();
      });

      it('markEmailVerified sets the flag, and is quiet for an unknown user', async () => {
        const user = newUser();
        await store.createUserIfAbsent(user);

        await store.markEmailVerified(user.id);
        await store.markEmailVerified(user.id);
        await expect(store.markEmailVerified(randomUUID())).resolves.toBeUndefined();

        await expect(store.findUserById(user.id)).resolves.toEqual({
          ...user,
          emailVerified: true,
        });
      });

      it('hands out copies, so a caller cannot change the stored user', async () => {
        const user = newUser();
        const { user: returned } = await store.createUserIfAbsent(user);

        returned.email = 'changed@example.test';
        user.name = 'Changed';

        expect(await store.findUserById(user.id)).toMatchObject({ name: null });
        expect((await store.findUserById(user.id))?.email).toMatch(/^contract-/);
      });
    });

    describe('sessions', () => {
      async function storedUser(): Promise<AuthUser> {
        const user = newUser();
        await store.createUserIfAbsent(user);
        return user;
      }

      it('a session round trips by its raw token', async () => {
        const user = await storedUser();
        const session = { token: newToken(), userId: user.id, expiresAt: LATER };

        await store.insertSession(session);

        await expect(store.findSession(session.token)).resolves.toEqual(session);
      });

      it('findSession returns null for an unknown token', async () => {
        await expect(store.findSession(newToken())).resolves.toBeNull();
        await expect(store.findSession('')).resolves.toBeNull();
      });

      it('deleteSession removes that session only, and is safe to repeat', async () => {
        const user = await storedUser();
        const kept = { token: newToken(), userId: user.id, expiresAt: LATER };
        const gone = { token: newToken(), userId: user.id, expiresAt: LATER };
        await store.insertSession(kept);
        await store.insertSession(gone);

        await store.deleteSession(gone.token);
        await store.deleteSession(gone.token);
        await store.deleteSession(newToken());

        await expect(store.findSession(gone.token)).resolves.toBeNull();
        await expect(store.findSession(kept.token)).resolves.toEqual(kept);
      });

      it('returns an expired session as stored, because expiry is checked by the caller', async () => {
        const user = await storedUser();
        const session = { token: newToken(), userId: user.id, expiresAt: LONG_AGO };
        await store.insertSession(session);

        await expect(store.findSession(session.token)).resolves.toEqual(session);
      });
    });

    describe('link tokens', () => {
      it('a link token round trips by its raw token with usedAt null', async () => {
        const link = newLink();

        await store.insertLinkToken(link);

        await expect(store.findLinkToken(link.token)).resolves.toEqual(link);
        await store.markLinkTokenUsed(link.token, CREATED_AT);
      });

      it('findLinkToken returns null for an unknown token', async () => {
        await expect(store.findLinkToken(newToken())).resolves.toBeNull();
      });

      it('can be marked used exactly once, and is gone afterwards', async () => {
        const link = newLink();
        await store.insertLinkToken(link);

        await expect(store.markLinkTokenUsed(link.token, CREATED_AT)).resolves.toBe(true);
        await expect(store.markLinkTokenUsed(link.token, CREATED_AT)).resolves.toBe(false);

        await expect(store.findLinkToken(link.token)).resolves.toBeNull();
      });

      it('of two calls racing for one token exactly one wins', async () => {
        const link = newLink();
        await store.insertLinkToken(link);

        const claims = await Promise.all([
          store.markLinkTokenUsed(link.token, CREATED_AT),
          store.markLinkTokenUsed(link.token, CREATED_AT),
        ]);

        expect(claims.filter(Boolean)).toHaveLength(1);
        await expect(store.findLinkToken(link.token)).resolves.toBeNull();
      });

      it('of twelve calls racing for one token exactly one wins', async () => {
        const link = newLink();
        await store.insertLinkToken(link);

        const claims = await Promise.all(
          Array.from({ length: 12 }, () => store.markLinkTokenUsed(link.token, CREATED_AT)),
        );

        expect(claims.filter(Boolean)).toHaveLength(1);
      });

      it('marking an unknown token returns false', async () => {
        await expect(store.markLinkTokenUsed(newToken(), CREATED_AT)).resolves.toBe(false);
      });

      it('using one token leaves another alone', async () => {
        const first = newLink();
        const second = newLink();
        await store.insertLinkToken(first);
        await store.insertLinkToken(second);

        await store.markLinkTokenUsed(first.token, CREATED_AT);

        await expect(store.findLinkToken(second.token)).resolves.toEqual(second);
        await expect(store.markLinkTokenUsed(second.token, CREATED_AT)).resolves.toBe(true);
      });

      it('a link inserted as already used cannot be found or claimed', async () => {
        const link = newLink({ usedAt: CREATED_AT });

        await store.insertLinkToken(link);

        await expect(store.findLinkToken(link.token)).resolves.toBeNull();
        await expect(store.markLinkTokenUsed(link.token, CREATED_AT)).resolves.toBe(false);
      });

      it('a session token is not a link token and the other way round', async () => {
        const user = newUser();
        await store.createUserIfAbsent(user);
        const token = newToken();
        await store.insertSession({ token, userId: user.id, expiresAt: LATER });

        await expect(store.findLinkToken(token)).resolves.toBeNull();
        await expect(store.markLinkTokenUsed(token, CREATED_AT)).resolves.toBe(false);
        await expect(store.findSession(token)).resolves.not.toBeNull();
      });
    });
  });
}
