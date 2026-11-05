# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `ProfileStore` port (`getProfile`, `insertProfile`, `updateProfile`, `listLearnerLanguages`, `upsertLearnerLanguage`) and `createInMemoryProfileStore()`, the adapter used in unit tests. `insertProfile` keeps an existing row. `upsertLearnerLanguage` changes only `targetLevel` on an existing row, so `startedAt` and `currentLevelEstimate` survive a repeat.
- `src/identity.ts`: `createIdentity({ store, bus, now? })` returning `ensureProfile`, `getProfile`, `updateProfile`, `setActiveLanguage` and `listLearnerLanguages`. No module level state. `ensureProfile` creates a default profile (`uiLocale` `en`, `timezone` `UTC`, `dailyGoalMinutes` 15) and is idempotent. `getProfile` throws `ProfileNotFoundError` for an unknown user. `updateProfile` accepts only `ProfileEditable` fields and checks them: `dailyGoalMinutes` a whole number from 5 to 120, `uiLocale` and `timezone` non empty. `setActiveLanguage` checks the language and level against `LANGUAGE_CODES` and `CEFR_LEVELS`, upserts the learner language, sets `activeLanguage` on the profile and emits `user.language_set`.
- `ProfileNotFoundError`, exported from `src/index.ts` with the factory, the port and the in memory adapter.
- `tests/identity.test.ts`: `setActiveLanguage` writes `learner_languages` in the in memory store and emits `user.language_set`; a repeat keeps `startedAt` and updates the target level; `ensureProfile` is idempotent; `getProfile` on an unknown user throws; `updateProfile` validation; `listLearnerLanguages` per learner.

### Notes
- No sign in here. `core-auth` owns users and sessions.
- The Postgres adapter for `ProfileStore` is a later row (P1-32).
