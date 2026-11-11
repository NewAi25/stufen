# @stufen/core-progress

## Purpose

Mastery per can do descriptor, level estimate and streaks.
Applies the evidence rule from ADR-004. Never grades anything itself.

Kind: `core`. May import: `contracts`, `db`.

## Public API

Everything is built by one factory. Nothing is global.

```ts
createProgress({ store, bus, listCandos, now?, onError? }): ProgressService

// ProgressService
attach(bus?): Unsubscribe                                 // listens to attempt.recorded, emits cando.mastered
recordProductionScore(userId, candoId, score): Promise<void>   // score 0 to 5, may emit cando.mastered
masteryFor(userId, language, level?): Promise<CandoMastery[]>
levelEstimate(userId, language): Promise<LevelEstimate | null>
recordEstimate(userId, language, level, confidence, method): Promise<void>  // emits level.reached when level rises
streak(userId, language): Promise<Streak>
levelMap(userId, language): Promise<ProgressLevelMap>     // per level: descriptors, mastered count, status, checkpoint status

// Storage port and its two adapters
MasteryStore
createInMemoryMasteryStore(): MasteryStore
createPostgresMasteryStore(db: Database): MasteryStore    // db is the handle from createDb in @stufen/db

// Pure rules
isMastered(row, cando, recent?): boolean
effectiveRule(cando): Required<MasteryRule>
defaultProductionScore(level): number                     // 3 for A1 to B2, 4 for C1 and C2
recentAccuracy(outcomes): number | null
levelStatus(candosOfLevel, masteryRows, checkpointPassed): 'reached' | 'working_towards' | 'not_started'
levelConditions(candosOfLevel, masteryRows, checkpointPassed): LevelConditions
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

### What the factory needs

| Option | What it is |
|--------|------------|
| `store` | A `MasteryStore`. Tests use `createInMemoryMasteryStore()`. The app passes `createPostgresMasteryStore(db)`. |
| `bus` | The event bus from `contracts`. Events are emitted on it. |
| `listCandos(language, level?)` | An async function that returns the descriptors. The composition root passes the one from `core-curriculum`. This box never imports that box. |
| `now` | Optional clock. Default: the system clock. |
| `onError(error, context)` | Optional. Receives every failure from the bus handler. Default: `console.error`. |

### The mastery rule

A descriptor is mastered when all of these hold:

1. It has at least 6 attempts.
2. The learner was correct in at least 2 different exercise types.
3. At least 80 percent of the last 10 attempts were correct.
4. Only for `writing`, `spoken_production` and `spoken_interaction`: the best graded sample scored at least 3 of 5 for a descriptor at A1 to B2, and at least 4 of 5 for a descriptor at C1 or C2. The level is the descriptor's own `level`.

A descriptor can carry its own `masteryRule`. Each number it sets replaces the default number, and the numbers it leaves out stay at the default. A C1 descriptor that sets `bestProductionScore` to 3 is mastered with 3 of 5, and a B2 descriptor can ask for 4 of 5 the same way. A production descriptor always needs a graded sample, whatever number it sets.

`exerciseTypesSeen` on the mastery row lists an exercise type from the first correct attempt of that type. A type the learner only got wrong is not listed.

Mastery is set once. `masteredAt` gets the time, `cando.mastered` is emitted one time, and later mistakes do not take mastery away.

This box never grades. Attempts arrive as `attempt.recorded` events. Graded samples arrive through `recordProductionScore`, which the tutor and writing boxes call through the composition root.

### When a level is reached

Level L is `reached` only when all four conditions hold:

1. At least 80 percent of L's descriptors are mastered.
2. Every production descriptor of L (speaking and writing) is mastered.
3. The checkpoint for L is passed.
4. There is production evidence. Reading, listening, grammar and vocabulary alone never reach a level, even at 100 percent.

A level with some evidence that does not meet all four is `working_towards`. A level with no evidence is `not_started`.

Until `core-assessment` exists, the checkpoint counts as passed only when `recordEstimate` was called with method `checkpoint` for exactly that level.

### The level estimate

`levelEstimate` answers in this order: the highest level that is `reached`, else the latest estimate recorded with `recordEstimate`, else `null`. `recordEstimate` always appends. It emits `level.reached` only when the new level is above the previous estimate. The first estimate of a learner counts as a rise.

This is the app's estimate. It is not a certificate.

### The level map

`levelMap` returns six rows, A1 first. Each row has:

| Field | Meaning |
|-------|---------|
| `level` | A1 to C2 |
| `descriptors` | Every descriptor of the level with its `mastery` row, or `null` when there is no evidence yet |
| `candos` | The mastery rows that exist, in descriptor order |
| `masteredCount`, `totalCount` | Mastered descriptors over all descriptors |
| `status` | `reached`, `working_towards` or `not_started` |
| `checkpoint` | `locked` under 80 percent mastered, `available` from 80 percent, `passed` once a checkpoint estimate is recorded. `failed` is not returned yet |

### Streaks

Every `attempt.recorded` counts for the streak of its language. A day is a UTC calendar day for now. Two attempts on one day count once. The next day adds one. A missed day restarts the streak at 1, and `streak` reads as 0 current days while the learner has not come back. The longest streak is kept.

### Errors

`recordProductionScore` and `recordEstimate` throw `ProgressValidationError` with a `field` name for bad input, and store nothing. The bus handler never throws into the bus. It reports through `onError` and carries on with the next descriptor.

### The Postgres adapter

`createPostgresMasteryStore(db)` implements `MasteryStore` on the four tables below. `db` is the handle from `createDb` in `@stufen/db`. This box imports nothing else for database work.

Every method opens its own `withUser(db, userId, fn)` transaction for the user it acts for. Inside it the role is `stufen_app` and row level security is on, so a statement sees and changes only that user's rows. The owner connection is never used for learner data. A user id that is not a uuid is rejected with a `TypeError` before any query runs.

Both adapters pass the same contract, `tests/store-contract.ts`. The tables decide a few things the in memory adapter leaves to the caller:

| Point | What Postgres does |
|-------|--------------------|
| `updatedAt` of a mastery row | The first write keeps the caller's value. On every later write the trigger `cando_mastery_updated` sets the database clock |
| Order of `listMastery` | By descriptor id. The table has no column for the order rows were first written. The service does not depend on the order |
| Numbers | `bestProductionScore` keeps 2 decimals and `recentAccuracy` and `confidence` keep 3, as the `numeric` columns do. They come back as numbers. The rule itself reads accuracy from the attempt history, not from the rounded column |
| Attempt history | `cando_outcomes` is append only for the app role: no update, no delete. Every attempt stays in the table. `recentOutcomes` reads the newest ones, at most 50, and returns them oldest first |
| Append order | `created_at` is the only order column of `cando_outcomes` and `level_estimates`. An append therefore never stores a time at or before the newest row of the same history: it is moved one microsecond past it. Attempts with the same millisecond keep their order and read back with that millisecond. An attempt that arrives with an older time than the newest one reads back with the newest one's time |
| Streak day | `last_active_date` is written and read as a plain `YYYY-MM-DD` string and never passes through a JavaScript `Date`, so it cannot shift by a day in any time zone. Any other string is rejected |
| Unknown descriptor | `cando_mastery` and `cando_outcomes` point at `cando_descriptors`. An attempt for a descriptor id that is not in that table stores no evidence; the failure goes to `onError` and the other descriptors of the event are still handled |

Each store method is one transaction. A whole attempt (append the outcome, read the row, write the row) is several transactions, kept in order by the queue inside one `createProgress` instance. Two server processes that handle attempts of the same learner and descriptor at the same moment are not serialised against each other yet.

## Owns tables

| Table |
|-------|
| `cando_mastery` |
| `level_estimates` |
| `streaks` |
| `cando_outcomes` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`. `cando_outcomes` (migration 0005) holds one row per attempt and descriptor, because the rule needs the last 10 attempts. The store reads and writes it through `appendAttemptOutcome` and `recentOutcomes`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `cando.mastered` |
| emits | `level.reached` |
| listens | `attempt.recorded` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-progress/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-progress): message`.

## How to test it

```
pnpm --filter @stufen/core-progress test
```

This runs the rule tests, the service tests and the store contract on the in memory adapter. No database is needed. The Postgres tests in `tests/postgres-store.integration.test.ts` are skipped.

To run the Postgres tests as well, point `DATABASE_URL` at a PostgreSQL 16 or later that has every migration in `packages/db/migrations/` applied (`pnpm db:migrate`), with a login user that owns the tables:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-progress test
```

The integration test runs the same store contract on Postgres, then the whole `createProgress` service on the Postgres store with the real bus, then the row security checks between two users. It creates its own users (a row in `users`, then `ensure_profile`) and its own descriptors (random ids, unique codes, language `nl`) through the owner connection, and deletes exactly those rows at the end. It can run against a database that holds other data.

## Status

See the `core-progress` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
