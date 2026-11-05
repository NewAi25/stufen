# @stufen/core-auth

## Purpose

Sign in, sign out and session lookup. The interface is `AuthPort`, which lives in `contracts` so any box can depend on it without importing this one. This box supplies the implementations.

Version 0.1.0 ships one implementation: an in memory adapter with no auth library. It handles magic links and sessions, and it is what unit tests and local development use. The production adapter is better-auth on Postgres. It arrives in Phase 1 (row P1-37) behind the same port, so no other box sees its types. See ADR-008.

The first time a user is created the box emits `user.signed_up`. It knows nothing about profiles. `core-identity` owns the profile.

Kind: `core`. May import: `contracts`, `db`. Mail is not imported. It arrives as an injected `MailPort`.

## Not production

The in memory adapter keeps users, sessions and link tokens in process memory. Everything is lost when the process restarts, so every learner is signed out and every pending link stops working. Two server processes do not share sessions. Tokens are stored as plain text. `signInWithGoogle` returns a placeholder URL and talks to no provider. `createDevSession` signs anyone in without proof of the email address. Use this adapter for tests and local development only.

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

createInMemoryAuth(options: {
  mail: MailPort;              // required, magic link mail goes through it
  store?: AuthStore;           // default: createInMemoryAuthStore()
  bus?: EventBus;              // when given, receives user.signed_up
  now?: () => Date;            // default: system clock
  newToken?: () => string;     // default: 32 random bytes as hex
  newId?: () => string;        // default: random UUID
  sessionTtlMs?: number;       // default: 30 days
  linkTtlMs?: number;          // default: 15 minutes
  appName?: string;            // default: 'Stufen'
}): AuthPort & { createDevSession(email: string, name?: string): Promise<AuthSession> }

createInMemoryAuthStore(): AuthStore

class AuthError extends Error { code: 'invalid_email' | 'invalid_redirect' }
```

Exported types: `AuthPort`, `AuthSession`, `InMemoryAuth`, `InMemoryAuthOptions`, `AuthErrorCode`, `AuthStore`, `AuthUser`, `AuthSessionRecord`, `AuthLinkToken`.

There are no module level singletons. `apps/web` calls `createInMemoryAuth` once and passes the result to whatever needs it.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Behaviour

| Call | What happens |
|------|--------------|
| `requestMagicLink(email, redirectTo)` | Trims and lower cases the email. Stores a one time token and sends one mail. The mail text holds the link, which is `redirectTo` plus `?token=<token>`, or `&token=<token>` when `redirectTo` already has a query. A `#fragment` stays at the end. |
| `consumeMagicLink(token)` | Returns null for an unknown, expired or already used token. Otherwise marks the token used, finds or creates the user, marks the email verified, and returns a new session. |
| `getSession(sessionToken)` | Returns the session, or null for null, undefined, empty, unknown or expired tokens. |
| `signOut(sessionToken)` | Deletes the session. Safe to call twice. |
| `signInWithGoogle(redirectTo)` | Returns `/auth/dev-google?redirectTo=<encoded>`. A placeholder until better-auth arrives. |
| `createDevSession(email, name?)` | Finds or creates the user and returns a session with no link and no mail. For local development and for `apps/web` before real sign in exists. An existing user keeps the name it has. |

Errors. An email that does not look like `name@host.tld` throws `AuthError` with code `invalid_email`. A `redirectTo` that is neither a path starting with `/` nor an absolute `http` or `https` URL throws `AuthError` with code `invalid_redirect`. Paths starting with `//` or `/\` are refused because a browser reads them as another site. A failed link is not an error. It returns null.

Emails are compared after trimming and lower casing, so `A@Example.com` and `a@example.com` are one user.

## Storage port

`AuthStore` is the small set of reads and writes sign in needs. The Postgres adapter in Phase 1 implements the same interface.

```ts
interface AuthStore {
  createUserIfAbsent(user: AuthUser): Promise<{ user: AuthUser; created: boolean }>;  // atomic on email
  findUserById(userId: string): Promise<AuthUser | null>;
  markEmailVerified(userId: string): Promise<void>;
  insertSession(session: AuthSessionRecord): Promise<void>;
  findSession(token: string): Promise<AuthSessionRecord | null>;
  deleteSession(token: string): Promise<void>;
  insertLinkToken(link: AuthLinkToken): Promise<void>;
  findLinkToken(token: string): Promise<AuthLinkToken | null>;
  markLinkTokenUsed(token: string, usedAt: string): Promise<boolean>;                 // atomic, true when claimed
}

interface AuthUser { id: string; email: string; emailVerified: boolean; name: string | null; createdAt: string }
interface AuthSessionRecord { token: string; userId: string; expiresAt: string }
interface AuthLinkToken { token: string; email: string; redirectTo: string; expiresAt: string; usedAt: string | null }
```

All timestamps are ISO 8601 strings.

## Owns tables

| Table | Migration |
|-------|-----------|
| `users` | `0001_init.sql` |
| `sessions` | `0002` (planned) |
| `accounts` | `0002` (planned) |
| `verifications` | `0002` (planned) |

Columns are in `packages/db/migrations/`. Version 0.1.0 reads and writes none of them. The Postgres adapter in Phase 1 will. `users` has no row level security because sign in must look a user up by email before any user id is known; this box is the only one that touches it.

## Emits and listens

| Direction | Event | When |
|-----------|-------|------|
| emits | `user.signed_up` | Once per new user, on the first `consumeMagicLink` or `createDevSession` for that email, when a bus was passed in |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-auth/`. If `contracts` or `db` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-auth): message`.

## How to test it

```
pnpm --filter @stufen/core-auth test
```

The tests use a fake mail port that records messages and the in process event bus from `contracts`. They touch no network and no filesystem.

## Status

See the `core-auth` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
