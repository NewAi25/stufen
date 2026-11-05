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

Only the in memory adapter exists in 0.1.0. The Postgres adapter for `ProfileStore`, built on `db`, is a later row (P1-32) and will not change the factory.

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

## Status

See the `core-identity` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
