# Changelog

## [Unreleased]

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
