# @stufen/core-auth

## Purpose

Sign up, sign in, sign out and session lookup. Wraps the better-auth library so no other box sees its types. After a successful sign up it calls the database function `ensure_profile(user_id)` so the learner gets a `profiles` row and a `free_beta` entitlement, then emits `user.signed_up`. Knows nothing about profiles beyond that call; `core-identity` owns the profile.

Kind: `core`. May import: `contracts`, `db`.

## Public API

```ts
signUp(email, password, name?): Promise<{ userId: string }>      // emits user.signed_up
signIn(email, password): Promise<{ userId: string; sessionToken: string }>
signOut(sessionToken): Promise<void>
getSession(sessionToken): Promise<{ userId: string } | null>
requireUser(sessionToken): Promise<{ userId: string }>            // throws when signed out
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public. The `docs/04` entry for this box is still to be written.

## Owns tables

| Table | Migration |
|-------|-----------|
| `users` | `0001_init.sql` |
| `sessions` | `0002` (planned) |
| `accounts` | `0002` (planned) |
| `verifications` | `0002` (planned) |

Columns are in `packages/db/migrations/`. `users` has no row level security because sign in must look a user up by email before any user id is known; this box is the only one that touches it.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `user.signed_up` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-auth/`. If `contracts` or `db` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-auth): message`.

## How to test it

```
pnpm --filter @stufen/core-auth test
```

## Status

See the `core-auth` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
