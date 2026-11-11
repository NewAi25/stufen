# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added
- `src/postgres-store.ts`: `createPostgresProfileStore(db)`, the Postgres adapter for the `ProfileStore` port (P1-32). Every method runs inside `withUser(db, userId, fn)` for the user id it is given, so it acts as the role `stufen_app` under row level security. The owner connection is never used for learner data.
- `insertProfile` on Postgres creates the row by calling the database function `ensure_profile(uuid)`, then sets the fields that differ from what the database gave the new row. An existing row is returned untouched. Two inserts racing for one user are serialised with a transaction level advisory lock, so the second one finds the row and leaves it alone. A user id with no row in `users` is rejected with a message that says so.
- One mapping between the snake_case columns and the contracts `Profile` and `LearnerLanguage` shapes. Timestamps come out as ISO strings. A language code or level in the database that is not in `LANGUAGE_CODES` or `CEFR_LEVELS` throws.
- `tests/store-contract.ts`: `runProfileStoreContract(name, makeStore)`, the behaviour every adapter must show, written against the port only. `tests/store-contract.memory.test.ts` runs it for the in memory store, `tests/postgres-store.integration.test.ts` for Postgres.
- `tests/postgres-store.integration.test.ts`: skipped without `DATABASE_URL`. Runs the contract on a real Postgres and adds the Postgres only checks: user A cannot read or change user B's profile or learner languages, a patch that carries another id changes nothing for that user, and `createIdentity` works on the Postgres store including `setActiveLanguage` emitting `user.language_set`. It creates its own rows in `users` and deletes exactly those at the end.
- `src/index.ts` exports `createPostgresProfileStore`.

### Notes
- On Postgres `createdAt` and `updatedAt` come from the database clock. The `profiles_updated` trigger sets `updated_at = now()` on every update, so the `updatedAt` a caller puts in a `ProfileStorePatch` is replaced there. The in memory store still keeps the caller's value.
- On Postgres `insertProfile` with a null `displayName` keeps what `ensure_profile` wrote: `users.name`, or an empty string when the user has no name. The in memory store stores null.
- No change to `createIdentity` or to the port.

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `ProfileStore` port (`getProfile`, `insertProfile`, `updateProfile`, `listLearnerLanguages`, `upsertLearnerLanguage`) and `createInMemoryProfileStore()`, the adapter used in unit tests. `insertProfile` keeps an existing row. `upsertLearnerLanguage` changes only `targetLevel` on an existing row, so `startedAt` and `currentLevelEstimate` survive a repeat.
- `src/identity.ts`: `createIdentity({ store, bus, now? })` returning `ensureProfile`, `getProfile`, `updateProfile`, `setActiveLanguage` and `listLearnerLanguages`. No module level state. `ensureProfile` creates a default profile (`uiLocale` `en`, `timezone` `UTC`, `dailyGoalMinutes` 15) and is idempotent. `getProfile` throws `ProfileNotFoundError` for an unknown user. `updateProfile` accepts only `ProfileEditable` fields and checks them: `dailyGoalMinutes` a whole number from 5 to 120, `uiLocale` and `timezone` non empty. `setActiveLanguage` checks the language and level against `LANGUAGE_CODES` and `CEFR_LEVELS`, upserts the learner language, sets `activeLanguage` on the profile and emits `user.language_set`.
- `ProfileNotFoundError`, exported from `src/index.ts` with the factory, the port and the in memory adapter.
- `tests/identity.test.ts`: `setActiveLanguage` writes `learner_languages` in the in memory store and emits `user.language_set`; a repeat keeps `startedAt` and updates the target level; `ensureProfile` is idempotent; `getProfile` on an unknown user throws; `updateProfile` validation; `listLearnerLanguages` per learner.

### Notes
- No sign in here. `core-auth` owns users and sessions.
- The Postgres adapter for `ProfileStore` is a later row (P1-32).
