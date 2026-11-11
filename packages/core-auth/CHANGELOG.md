# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-11

Row P1-37. Implements ADR-009: magic link sign in is our own code on the `AuthStore` port, now with a Postgres store. No auth library.

### Added
- `createAuth(options)`: the sign in service on any `AuthStore`, with `store` required. This is what production runs. `createInMemoryAuth(options)` is now a thin wrapper that supplies the in memory store. Behaviour is unchanged and the 44 tests of 0.1.0 pass untouched.
- `src/postgres-store.ts`: `createPostgresAuthStore(db)`, the Postgres adapter for `AuthStore` on `users`, `sessions` and `verifications`. All of it is owner work on `db` directly; the role `stufen_app` has no access to `sessions` and `verifications`.
- Tokens are hashed at rest. The adapter stores the SHA-256 hash (hex) of every session token and magic link token. The raw token exists only in the cookie and in the email.
- Magic link tokens live in `verifications` with identifier `magic-link:<hash>` and a JSON value holding the email and `redirectTo`. Single use is one statement, `delete ... where identifier = ... returning`, so of any number of consumes racing for one link exactly one succeeds.
- `createUserIfAbsent` on Postgres inserts with `on conflict (email) do nothing` and, for a new user, calls `ensure_profile(id)` in the same transaction. The profile and the entitlement exist before anything else can see the user.
- `deleteExpiredSessions(now)` and `deleteExpiredLinkTokens(now)` on the Postgres store only, for a later clean up job. Both return the number of rows deleted. The second one touches only `magic-link:` rows.
- `AuthError` code `dev_session_disabled`. `createDevSession` throws it when `NODE_ENV` is production, before it reads or writes anything. `NODE_ENV` is read on every call through the new `env` option (default `process.env`).
- `tests/store-contract.ts`: `runAuthStoreContract(name, makeStore)`, the behaviour both adapters share, including two and eight concurrent `createUserIfAbsent` calls for one email and two and twelve concurrent claims of one link token. `tests/store-contract.memory.test.ts` runs it in memory, `tests/postgres-store.integration.test.ts` on Postgres.
- `tests/postgres-store.integration.test.ts`: skipped without `DATABASE_URL`. The contract, then the whole flow through `createAuth` with a recording mail port and the real bus, the check that no raw token is in `sessions` or `verifications`, expiry, sign out, the clean up methods, and the check that the app role cannot read or write the auth tables inside `withUser`.
- `tests/create-auth.test.ts` and `tests/postgres-store.test.ts`: `createAuth` on an explicit store, the production guard, and the hashing helpers. No database.
- `src/index.ts` exports `createAuth`, `createPostgresAuthStore` and the types `Auth`, `AuthOptions` and `PostgresAuthStore`.

### Changed
- A used link token is deleted in both adapters, not flagged. `findLinkToken` returns null for a used token and `usedAt` is null on every token a store returns. The in memory store used to keep the token with `usedAt` set. `consumeMagicLink` behaves as before: a used link returns null. The `AuthStore` signatures did not change.
- `InMemoryAuthOptions` is now `AuthOptions` with `store` optional, and `InMemoryAuth` is an alias of `Auth`. Same shape as before plus `env`.

### Notes
- The Postgres store refuses a user whose email is not already trimmed and lower cased. `users.email` is unique by exact text, so this keeps one mailbox from becoming two accounts if something other than `createAuth` ever calls the store.
- User ids must be uuids on Postgres. `createAuth` generates them by default.
- `createUserIfAbsent` stores the `createdAt` the service gives it, so both adapters return the same user.
- Google sign in is not built. It is row P1-46. `signInWithGoogle` still returns the placeholder URL.

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `AuthStore` storage port for users, sessions and link tokens (`createUserIfAbsent`, `findUserById`, `markEmailVerified`, `insertSession`, `findSession`, `deleteSession`, `insertLinkToken`, `findLinkToken`, `markLinkTokenUsed`), the record types `AuthUser`, `AuthSessionRecord` and `AuthLinkToken`, and `createInMemoryAuthStore()`. The Postgres and better-auth adapter implements the same port in Phase 1.
- `src/auth.ts`: `createInMemoryAuth(options)`, an in memory implementation of `AuthPort` from `contracts` with no auth library. `requestMagicLink` stores a one time token and sends one mail through the injected `MailPort`. `consumeMagicLink` returns null for unknown, expired or used tokens, otherwise finds or creates the user, marks the email verified and returns a session. `getSession` returns null for missing, unknown or expired tokens. `signOut` is safe to call twice. `signInWithGoogle` returns a placeholder URL until better-auth arrives. Extra for development: `createDevSession(email, name?)`.
- `AuthError` with codes `invalid_email` and `invalid_redirect`. Emails are trimmed and lower cased. `redirectTo` must be a path starting with `/` or an absolute `http` or `https` URL.
- Emits `user.signed_up` once per new user when an `EventBus` is passed in.
- Injectable clock, token generator, id generator, session lifetime (default 30 days), link lifetime (default 15 minutes) and app name. No module level state.
- `tests/auth.test.ts`: the P0-25 acceptance check plus mail content, one time tokens, link and session expiry, sign out, email normalisation, `user.signed_up` exactly once per new user, invalid email and invalid redirect, and `createDevSession`.
