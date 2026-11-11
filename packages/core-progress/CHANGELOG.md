# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-11

### Added
- `src/postgres-store.ts`: `createPostgresMasteryStore(db)`, the Postgres adapter of the `MasteryStore` port (P1-31), exported from `src/index.ts`. It reads and writes `cando_mastery`, `cando_outcomes`, `level_estimates` and `streaks` through `@stufen/db` only. Every method runs inside `withUser(db, userId, fn)` for the user it acts for, so row level security applies to every statement.
- `upsertMastery` and `upsertStreak` are one `insert ... on conflict ... do update` each. Numeric columns come back as numbers, text arrays as string arrays, timestamps as ISO strings.
- `appendAttemptOutcome` inserts into `cando_outcomes`, which is append only for the app role. `recentOutcomes` reads the newest rows and returns them oldest first, as the in memory adapter does.
- Appends to `cando_outcomes` and `level_estimates` keep their order even when two rows carry the same time or a later row carries an earlier one: the stored `created_at` is never at or before the newest row of the same history. Appends to one history queue behind an advisory lock.
- The streak day is written and read as a plain `YYYY-MM-DD` string, so it cannot shift by a day through a time zone.
- `defaultProductionScore(level)`, `ADVANCED_PRODUCTION_SCORE` and `ADVANCED_LEVELS` in `src/rule.ts`.
- `tests/store-contract.ts`: `runMasteryStoreContract(name, makeHarness)`, the behaviour both adapters share. `tests/store-contract.memory.test.ts` runs it on the in memory adapter. `tests/postgres-store.integration.test.ts` runs it on Postgres, then the whole `createProgress` service on the Postgres store with the real bus, then the row security checks between two users. The integration test is skipped without `DATABASE_URL` and removes every row it created.

### Changed
- The mastery rule: the default best production score now depends on the descriptor's level. It is 3 of 5 for A1 to B2 and 4 of 5 for C1 and C2, as `docs/04-module-contracts.md` says. A descriptor's own `masteryRule.bestProductionScore` still replaces it. Before, the default was 3 at every level.
- `effectiveRule(cando)` and `isMastered(row, cando, recent?)` now read `cando.level`. Callers that pass a full `Cando` need no change.
- The `MasteryStore` port comments say what an adapter may decide: `updatedAt` after a replace, the order of `listMastery`, and that `recentOutcomes` never returns more than `OUTCOME_HISTORY_LIMIT` attempts. The in memory adapter behaves as before.

### Notes
- On Postgres the trigger `cando_mastery_updated` sets `updated_at` to the database clock on every update, so `updatedAt` after a replace is not the caller's value.
- `cando_mastery` has no column for the order rows were first written. The Postgres adapter orders `listMastery` by descriptor id.
- `recent_accuracy` is `numeric(4,3)` and `best_production_score` is `numeric(3,2)`, so stored values are rounded to 3 and 2 decimals. The rule computes accuracy from the attempt history and is not affected.
- An attempt for a descriptor id that is not in `cando_descriptors` cannot be stored on Postgres (foreign key). The in memory adapter keeps such evidence.
- Each store method is its own transaction. Attempts of one learner and descriptor handled by two server processes at the same moment are not serialised against each other.

## [0.1.0] - 2026-11-06

### Added
- `src/store.ts`: the `MasteryStore` port (`getMastery`, `upsertMastery`, `listMastery`, `appendAttemptOutcome`, `recentOutcomes`, `insertEstimate`, `latestEstimate`, `listEstimates`, `getStreak`, `upsertStreak`) and `createInMemoryMasteryStore()`. The store keeps the attempt history per user and descriptor, because recent accuracy needs the last ten attempts. The in memory adapter copies rows on the way in and out and keeps at most 50 attempts per descriptor.
- `src/rule.ts`: pure functions with no storage, clock or bus. `isMastered(row, cando, recent?)` is the default mastery rule from `docs/04-module-contracts.md`: evidence count at least 6, correct in at least 2 distinct exercise types, accuracy over the last 10 attempts at least 0.8, and for `writing`, `spoken_production` and `spoken_interaction` a best production score of at least 3 of 5. A descriptor's own `masteryRule` replaces those numbers field by field (`effectiveRule`). `recentAccuracy(outcomes)` is the share of correct attempts among the last ten.
- `levelStatus(candosOfLevel, masteryRows, checkpointPassed)` returns `reached`, `working_towards` or `not_started`. `levelConditions` returns the four conditions of "Level L is reached" one by one: 80 percent of the descriptors mastered, every production descriptor mastered, the checkpoint passed, and production evidence present, so receptive and scaffolding evidence alone never reaches a level.
- `src/progress.ts`: `createProgress({ store, bus, listCandos, now?, onError? })`. The descriptor list arrives through the injected `listCandos(language, level?)`; this box does not import `core-curriculum`. There is no module level state.
- `attach(bus?)` subscribes to `attempt.recorded`. Each descriptor id of the event gets one more piece of evidence, the exercise type is listed once an attempt of that type is correct, recent accuracy is refreshed, and the first time the rule is true `masteredAt` is set and `cando.mastered` is emitted once. Mastery is never taken away again. Failures inside the handler never reach the bus; they go to `onError`.
- The same handler keeps the streak for the event's language: one count per UTC calendar day, the next day adds one, a gap restarts at 1, and the longest streak is kept.
- `recordProductionScore(userId, candoId, score)` for the tutor and writing boxes, called through the composition root. Score 0 to 5, the best score is kept, and it may complete the rule and emit `cando.mastered`.
- `masteryFor(userId, language, level?)`, `levelEstimate(userId, language)`, `recordEstimate(userId, language, level, confidence, method)`, `streak(userId, language)` and `levelMap(userId, language)`. `levelEstimate` is the highest reached level, else the latest recorded estimate, else null. `recordEstimate` appends and emits `level.reached` only when the level rises above the previous estimate; the first estimate counts as a rise. `levelMap` returns all six levels with the descriptors, their mastery rows, the mastered count, the status and the checkpoint status.
- `ProgressValidationError` with a `field` name, thrown for a score outside 0 to 5, an unknown descriptor, a level outside A1 to C2, a confidence outside 0 to 1 and an unknown method. Nothing is stored when it is thrown.
- `tests/rule.test.ts`: each clause of the mastery rule, each override, and each of the four level conditions. `tests/progress.test.ts`: the service with the real bus from `contracts`, an injected clock and the in memory store.

### Notes
- Until `core-assessment` exists, a checkpoint counts as passed only when an estimate with method `checkpoint` was recorded for exactly that level. The checkpoint status `failed` is never returned yet.
- `writing.graded` is not subscribed. Its payload carries no descriptor ids, so a score cannot be credited from it. The writing box calls `recordProductionScore` through the composition root instead.
- `levelEstimate` resolves to `LevelEstimate | null`, where `docs/04-module-contracts.md` shows `Promise<LevelEstimate>`. A learner without a reached level and without a recorded estimate has no estimate.
