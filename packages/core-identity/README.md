# @stufen/core-identity

## Purpose

Profile, settings and the learner's active target language.
Sign in is not here: `core-auth` owns users and sessions and calls the
database function `ensure_profile(user_id)` after sign up, which creates the
`profiles` row this box then manages. Knows nothing about lessons or content.

Kind: `core`. May import: `contracts`, `db`.

## Public API

The box is built by a factory. There is no module level state, so `apps/web` (or a test) decides which store and which bus it runs on.

```ts
createIdentity(options: { store: ProfileStore; bus: EventBus; now?: () => Date }): Identity

interface Identity {
  ensureProfile(userId, displayName?): Promise<Profile>               // creates the default profile if missing
  getProfile(userId): Promise<Profile>                                // throws ProfileNotFoundError
  updateProfile(userId, patch: Partial<ProfileEditable>): Promise<Profile>
  setActiveLanguage(userId, language, targetLevel): Promise<void>     // emits user.language_set
  listLearnerLanguages(userId): Promise<LearnerLanguage[]>            // oldest first
}

interface ProfileStore {                                              // the storage port
  getProfile(userId): Promise<Profile | null>
  insertProfile(profile): Promise<Profile>                            // keeps an existing row
  updateProfile(userId, patch: ProfileStorePatch): Promise<Profile | null>
  listLearnerLanguages(userId): Promise<LearnerLanguage[]>
  upsertLearnerLanguage(input: LearnerLanguageUpsert): Promise<LearnerLanguage>
}

createInMemoryProfileStore(): ProfileStore                            // unit tests and local wiring
createPostgresProfileStore(db: Database): ProfileStore                // PostgreSQL through db, see below
class ProfileNotFoundError extends Error { userId: string }
```

Exported types: `Identity`, `IdentityOptions`, `ProfileStore`, `ProfileStorePatch`, `LearnerLanguageUpsert`. `Profile`, `ProfileEditable` and `LearnerLanguage` come from `contracts`.

Wiring example:

```ts
import { createEventBus } from '@stufen/contracts';
import { createIdentity, createInMemoryProfileStore } from '@stufen/core-identity';

const identity = createIdentity({ store: createInMemoryProfileStore(), bus: createEventBus() });
await identity.ensureProfile(userId, 'Ada');
await identity.setActiveLanguage(userId, 'de', 'B2');
```

Rules the functions keep:

| Function | Rule |
|----------|------|
| `ensureProfile` | Default profile is `uiLocale` `en`, `timezone` `UTC`, `dailyGoalMinutes` 15, no active language. A second call returns the existing profile and changes nothing. |
| `getProfile` | Unknown user throws `ProfileNotFoundError`. |
| `updateProfile` | Only `displayName`, `uiLocale`, `timezone`, `dailyGoalMinutes`. `dailyGoalMinutes` is a whole number from 5 to 120. `uiLocale` and `timezone` are non empty. A bad value or any other field throws `RangeError` and nothing is stored. An empty patch returns the profile unchanged. |
| `setActiveLanguage` | Language must be in `LANGUAGE_CODES` and level in `CEFR_LEVELS`, otherwise `RangeError`. Unknown user throws `ProfileNotFoundError`. Writes the `learner_languages` row, sets `profiles.active_language`, then emits `user.language_set`. A repeat for the same language keeps `startedAt` and the level estimate and updates the target level. |
| `listLearnerLanguages` | Every language of that learner, oldest `startedAt` first. Empty list if none. |

### The Postgres adapter

`createPostgresProfileStore(db)` implements the same `ProfileStore` port on PostgreSQL. `db` is the handle from `createDb` in `@stufen/db`. The factory and the port did not change, so swapping the store is the only wiring difference:

```ts
import { createEventBus } from '@stufen/contracts';
import { createDb } from '@stufen/db';
import { createIdentity, createPostgresProfileStore } from '@stufen/core-identity';

const db = createDb(process.env.DATABASE_URL);
const identity = createIdentity({ store: createPostgresProfileStore(db), bus: createEventBus() });
```

Access model. Every method runs inside `withUser(db, userId, fn)` for the user id it is given, so it works as the restricted role `stufen_app` under row level security and can only see and change that user's rows. The `profiles` row itself is created by the database function `ensure_profile(uuid)`, which needs the row in `users` that `core-auth` creates at sign up; the owner connection is never used for learner data.

What differs from the in memory store:

| Topic | In memory | Postgres |
|-------|-----------|----------|
| `createdAt`, `updatedAt` | The caller's values | The database clock. The `profiles_updated` trigger sets `updated_at = now()` on every update, so the `updatedAt` in a patch is replaced |
| `insertProfile` with a null `displayName` | Stores null | Keeps what `ensure_profile` wrote: `users.name`, or an empty string when the user has no name |
| `insertProfile` for an id with no row in `users` | Stores the profile | Throws an error that says the `users` row is missing. Nothing is stored |
| User ids | Any string | Must be a uuid. `withUser` throws `TypeError` otherwise |
| A language code or level in the database that `contracts` does not list | Cannot happen | Throws when the row is read |

`insertProfile` sets only the fields that differ from the row `ensure_profile` created. Two inserts racing for the same user are queued with a transaction level advisory lock, so the second finds the row and leaves it untouched.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `profiles` |
| `learner_languages` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`. `profiles.id` references `users.id`, which `core-auth` owns.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `user.language_set` |

`user.signed_up` is emitted by `core-auth`, not by this box.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-identity/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-identity): message`.

## How to test it

```
pnpm --filter @stufen/core-identity test
```

That runs the unit tests. They need no database, and the integration test is reported as skipped.

| File | What it checks |
|------|----------------|
| `tests/identity.test.ts` | The `createIdentity` functions on the in memory store |
| `tests/store-contract.ts` | Not a test file. `runProfileStoreContract(name, makeStore)` holds the behaviour every `ProfileStore` adapter must show: insert is idempotent, get on an unknown user returns null, update persists, a learner language upsert keeps `startedAt` and changes the target level, list order |
| `tests/store-contract.memory.test.ts` | Runs the contract for the in memory store |
| `tests/postgres-store.integration.test.ts` | Runs the contract for Postgres and adds the Postgres only checks. Skipped unless `DATABASE_URL` is set |

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. `packages/db/README.md` says how to start one with or without Docker. Then:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-identity test
```

In PowerShell set the variable first with `$env:DATABASE_URL = '...'`.

The test creates its own rows in `users` through the owner connection, with random uuids and unique emails, and deletes exactly those rows at the end. The delete cascades to their profiles, learner languages and entitlements. It is safe on a database other tests are using. It needs the languages `de`, `nl` and `fr` in the `languages` table, which migration 0001 seeds.

| Check | Expected |
|-------|----------|
| The contract | Same result as the in memory store |
| User A reads user B's profile | Nothing comes back |
| User A updates user B's profile | Nothing changes |
| User A lists or writes user B's learner languages | Empty list; the write is refused with error 42501 |
| A patch that carries another user's id | That user's profile is unchanged |
| `insertProfile` with a null display name | Keeps the name from `users` |
| `insertProfile` for an id with no row in `users` | Error, nothing stored |
| Two inserts racing for one user | One row, both calls return it |
| `createIdentity` on the Postgres store | `ensureProfile`, `updateProfile`, `setActiveLanguage` and `listLearnerLanguages` work, and `user.language_set` is emitted |

## Status

See the `core-identity` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
