# @stufen/core-auth

## Purpose

Sign in, sign out and session lookup. The interface is `AuthPort`, which lives in `contracts` so any box can depend on it without importing this one. This box supplies the implementation.

Sign in is by magic link and it is our own code. There is no auth library. `createAuth` is the service. It keeps its data behind a small storage port called `AuthStore`, and there are two stores: Postgres for production and an in memory one for tests and local development. See ADR-009, which replaces the better-auth part of ADR-008.

The first time a user is created the box emits `user.signed_up`. On Postgres it also calls the database function `ensure_profile`, so the profile and the entitlement exist from the first moment. It knows nothing else about profiles. `core-identity` owns the profile.

Kind: `core`. May import: `contracts`, `db`. Mail is not imported. It arrives as an injected `MailPort`.

## Public API

```ts
// The port, re exported from contracts for convenience.
interface AuthPort {
  getSession(sessionToken: string | null | undefined): Promise<AuthSession | null>;
  requestMagicLink(email: string, redirectTo: string): Promise<{ sent: true }>;
  consumeMagicLink(token: string): Promise<AuthSession | null>;
  signInWithGoogle(redirectTo: string): Promise<{ url: string }>;
  signOut(sessionToken: string): Promise<void>;
}
interface AuthSession { sessionToken: string; userId: string; email: string; expiresAt: string }

createAuth(options: {
  store: AuthStore;            // required: createPostgresAuthStore(db) in production
  mail: MailPort;              // required, magic link mail goes through it
  bus?: EventBus;              // when given, receives user.signed_up
  now?: () => Date;            // default: system clock
  newToken?: () => string;     // default: 32 random bytes as hex
  newId?: () => string;        // default: random UUID
  sessionTtlMs?: number;       // default: 30 days
  linkTtlMs?: number;          // default: 15 minutes
  appName?: string;            // default: 'Stufen'
  env?: { NODE_ENV?: string }; // default: process.env, read on every createDevSession call
}): AuthPort & { createDevSession(email: string, name?: string): Promise<AuthSession> }

createInMemoryAuth(options)    // createAuth with `store` optional; default createInMemoryAuthStore()

createInMemoryAuthStore(): AuthStore
createPostgresAuthStore(db: Database): AuthStore & {
  deleteExpiredSessions(now: Date): Promise<number>;     // rows deleted
  deleteExpiredLinkTokens(now: Date): Promise<number>;   // rows deleted
}

class AuthError extends Error { code: 'invalid_email' | 'invalid_redirect' | 'dev_session_disabled' }
```

Exported types: `AuthPort`, `AuthSession`, `Auth`, `AuthOptions`, `InMemoryAuth`, `InMemoryAuthOptions`, `AuthErrorCode`, `AuthStore`, `PostgresAuthStore`, `AuthUser`, `AuthSessionRecord`, `AuthLinkToken`.

There are no module level singletons. `apps/web` builds the store and the service once and passes the result to whatever needs it:

```ts
const db = createDb(process.env.DATABASE_URL);
const auth = createAuth({ store: createPostgresAuthStore(db), mail, bus });
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Behaviour

| Call | What happens |
|------|--------------|
| `requestMagicLink(email, redirectTo)` | Trims and lower cases the email. Stores a one time token and sends one mail. The mail text holds the link, which is `redirectTo` plus `?token=<token>`, or `&token=<token>` when `redirectTo` already has a query. A `#fragment` stays at the end. The answer is the same whether or not the address has an account. |
| `consumeMagicLink(token)` | Returns null for an unknown, expired or already used token. Otherwise claims the token, finds or creates the user, marks the email verified, and returns a new session. |
| `getSession(sessionToken)` | Returns the session, or null for null, undefined, empty, unknown or expired tokens. An expired session is deleted when it is seen. |
| `signOut(sessionToken)` | Deletes the session. Safe to call twice. |
| `signInWithGoogle(redirectTo)` | Returns `/auth/dev-google?redirectTo=<encoded>`. A placeholder. See "Not built". |
| `createDevSession(email, name?)` | Finds or creates the user and returns a session with no link and no mail. For local development and tests. Refused in production, see below. An existing user keeps the name it has. |

Errors. An email that does not look like `name@host.tld` throws `AuthError` with code `invalid_email`. A `redirectTo` that is neither a path starting with `/` nor an absolute `http` or `https` URL throws `AuthError` with code `invalid_redirect`. Paths starting with `//` or `/\` are refused because a browser reads them as another site. A failed link is not an error. It returns null.

Emails are compared after trimming and lower casing, so `A@Example.com` and `a@example.com` are one user.

### createDevSession is refused in production

`createDevSession` signs anyone in without proof of the email address. When `NODE_ENV` is `production` it throws `AuthError` with code `dev_session_disabled`. The check runs on every call and before anything is read or written, so a refused call creates no user and no session and emits nothing. Upper case and stray spaces around the value still count as production. Tests pass their own `env` object instead of changing `process.env`.

The guard reads `NODE_ENV` only. A deployment that runs with `NODE_ENV` unset is not protected by it, so the host must set it.

## Storage port

`AuthStore` is the small set of reads and writes sign in needs. Both stores implement it, and `tests/store-contract.ts` holds the behaviour both must show.

```ts
interface AuthStore {
  createUserIfAbsent(user: AuthUser): Promise<{ user: AuthUser; created: boolean }>;  // atomic on email
  findUserById(userId: string): Promise<AuthUser | null>;
  markEmailVerified(userId: string): Promise<void>;
  insertSession(session: AuthSessionRecord): Promise<void>;
  findSession(token: string): Promise<AuthSessionRecord | null>;
  deleteSession(token: string): Promise<void>;
  insertLinkToken(link: AuthLinkToken): Promise<void>;
  findLinkToken(token: string): Promise<AuthLinkToken | null>;                        // null once used
  markLinkTokenUsed(token: string, usedAt: string): Promise<boolean>;                 // atomic, true when claimed
}

interface AuthUser { id: string; email: string; emailVerified: boolean; name: string | null; createdAt: string }
interface AuthSessionRecord { token: string; userId: string; expiresAt: string }
interface AuthLinkToken { token: string; email: string; redirectTo: string; expiresAt: string; usedAt: string | null }
```

All timestamps are ISO 8601 strings. The service always hands the store raw tokens and gets raw tokens back. How a token is kept is the store's business. Expiry is checked by the service, not by the store.

A used link token is deleted, in both stores. `findLinkToken` returns null for it, and `usedAt` is null on every token a store returns.

## The Postgres store

`createPostgresAuthStore(db)` takes the handle from `createDb` and works on `users`, `sessions` and `verifications`. All of it is owner work on `db` directly. It never uses `withUser`, because the app role `stufen_app` has no grant and no policy on `sessions` and `verifications` (migration 0002). Nothing that runs for a learner can read a session or a pending link. On `users` the app role can read its own row and write nothing (migration 0003).

| Method | Statement |
|--------|-----------|
| `createUserIfAbsent` | One transaction: `insert ... on conflict (email) do nothing`. When the row is new, `select ensure_profile(id)` in the same transaction, so the profile and the entitlement exist before anyone can see the user. When it is not new, the existing row is read and returned. |
| `findUserById`, `markEmailVerified` | By id. Something that is not a uuid is answered with null or ignored, without asking the database. |
| `insertSession`, `findSession`, `deleteSession` | By the hash of the token. `findSession` returns the raw token it was asked for. |
| `insertLinkToken`, `findLinkToken` | One row in `verifications`: identifier `magic-link:<hash>`, value JSON text `{"email": ..., "redirectTo": ...}`, and `expires_at`. |
| `markLinkTokenUsed` | `delete from verifications where identifier = ... returning id`. True when a row came back. |
| `deleteExpiredSessions(now)`, `deleteExpiredLinkTokens(now)` | Not on the port. For a scheduled clean up job, which does not exist yet. They delete rows whose `expires_at` is at or before `now` and return the count. The second one only touches `magic-link:` rows. |

Rules the Postgres store adds. User ids must be uuids, which is what `createAuth` generates. An email that is not already trimmed and lower cased is refused with an error, because `users.email` is unique by exact text and one mailbox must stay one user. `createAuth` always passes the normalised form.

### How tokens are stored

Session tokens and link tokens are 32 random bytes as hex. The database never holds one. Before a token goes into any statement the store replaces it with its SHA-256 hash as hex. `sessions.token` holds the hash. `verifications.identifier` holds `magic-link:` plus the hash. The raw session token exists only in the cookie, and the raw link token only in the email.

So someone who reads these tables, from a leaked backup for example, has nothing that signs in. A plain hash without a salt is enough here because the tokens are long random values, not passwords a person chose.

Lookups compare hashes. That is safe against timing attacks, because the hash of an attacker's guess is unpredictable, so how far a comparison got tells them nothing useful.

The in memory store keeps tokens as plain text. It is for tests and local development only.

### The single use guarantee

A magic link works once, also when two requests arrive at the same moment. `consumeMagicLink` reads the link, then claims it with `markLinkTokenUsed`, and only the caller that gets `true` goes on to create a session.

On Postgres the claim is a single `delete ... returning` statement. When two transactions try to delete the same row, one deletes it and the other waits on the row lock, then finds the row gone and deletes nothing. Exactly one caller gets a row back. There is no read followed by a write that a second caller could slip between. In memory the claim is one synchronous `Map.delete`.

The contract test fires two and twelve claims at once for one token and expects exactly one `true`. The integration test fires three `consumeMagicLink` calls at once and expects one session.

`createUserIfAbsent` is atomic in the same way: two sign ins racing for one new email create one user and one `user.signed_up` event, because the second insert waits on the unique index on `users.email`.

## Not built

- Google sign in. It is row P1-46 in the build sequence. `signInWithGoogle` validates the redirect and returns a placeholder URL. It talks to no provider. The `accounts` table from migration 0002 is kept for that row and nothing reads or writes it yet.
- A clean up job. Expired sessions are deleted when they are looked up, and expired links are simply refused. `deleteExpiredSessions` and `deleteExpiredLinkTokens` exist for a later job that removes the rest.
- Rate limiting of `requestMagicLink`, and "sign out everywhere". Neither is in this box yet.
- `sessions.ip_address` and `sessions.user_agent` stay empty. The port does not carry them.

The in memory store is not for production. Everything in it is lost when the process restarts, two server processes do not share sessions, and tokens are kept as plain text.

## Owns tables

| Table | Migration | Used by this box |
|-------|-----------|------------------|
| `users` | `0001_init.sql` | Yes. Created at first sign in. |
| `sessions` | `0002_auth.sql` | Yes. `token` holds a hash. |
| `verifications` | `0002_auth.sql` | Yes. One row per pending magic link. |
| `accounts` | `0002_auth.sql` | Not yet. Kept for Google sign in (P1-46). |

Columns are in `packages/db/migrations/`. `sessions`, `accounts` and `verifications` are owner only: row level security is on with no policy and the app role has no grant. Deleting a row in `users` cascades to that user's sessions.

## Emits and listens

| Direction | Event | When |
|-----------|-------|------|
| emits | `user.signed_up` | Once per new user, on the first `consumeMagicLink` or `createDevSession` for that email, when a bus was passed in. On Postgres the user, the profile and the entitlement are committed before the event fires. |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-auth/`. If `contracts` or `db` must change, do that in its own commit first.
3. A change to what a store does goes into `tests/store-contract.ts` first, so both stores are held to it.
4. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-auth): message`.

## How to test it

```
pnpm --filter @stufen/core-auth test
```

Without a database this runs the unit tests and the store contract against the in memory store. They use a fake mail port that records messages and the in process event bus from `contracts`. They touch no network and no filesystem. The integration test is listed as skipped.

| File | What it checks | Needs Postgres |
|------|----------------|----------------|
| `tests/auth.test.ts` | The service through `createInMemoryAuth` | No |
| `tests/create-auth.test.ts` | `createAuth` on an explicit store, `createDevSession` refused in production | No |
| `tests/postgres-store.test.ts` | The SHA-256 helpers | No |
| `tests/store-contract.memory.test.ts` | The store contract, in memory | No |
| `tests/postgres-store.integration.test.ts` | The store contract on Postgres, the whole sign in flow, no raw token at rest, the app role is locked out | Yes |

To run the integration test, point `DATABASE_URL` at a PostgreSQL 17 database that has all migrations applied, with a login user that owns the tables and is a member of `stufen_app`:

```
DATABASE_URL=postgres://stufen@localhost:5497/stufen_auth pnpm --filter @stufen/core-auth test
```

In PowerShell:

```
$env:DATABASE_URL = 'postgres://stufen@localhost:5497/stufen_auth'; pnpm --filter @stufen/core-auth test
```

It requests a link for a unique `@example.test` address, reads the token from the recorded mail, consumes it and checks that `getSession` returns the session, that `user.signed_up` fired once, that the profile and entitlement rows exist, and that neither raw token appears in `sessions` or `verifications`. It also checks a second consume, an expired link, sign out, and that a select on `sessions` inside `withUser` is denied. At the end it deletes exactly the users and verification rows it created. Nothing else in the database is changed.

## Status

See the `core-auth` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
