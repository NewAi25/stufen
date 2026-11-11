# @stufen/core-srs

## Purpose

FSRS scheduling for items: review queue, ratings and review logging.
Wraps ts-fsrs so no other box sees scheduler types. See ADR-005.

Kind: `core`. May import: `contracts`, `db`.

## Public API

Everything is built by one factory. `apps/web` calls it once and passes the store, the bus and, in tests, a clock.

```ts
createSrs({ store, bus, now?, requestRetention?, maximumInterval?, enableFuzz?, onError? }): SrsService

// SrsService
dueQueue(userId, language, limit = 20): Promise<StoredReviewCard[]>   // due cards, oldest due date first
review(userId, itemId, rating: 1|2|3|4): Promise<StoredReviewCard>    // emits item.reviewed
introduceItems(userId, language, itemIds): Promise<void>              // called after a lesson introduces items
stats(userId, language): Promise<{ due: number; learning: number; mature: number }>
attach(bus?): () => void                                              // listens to attempt.recorded, returns unsubscribe

// Storage
interface CardStore { getCard, upsertCard, listDue, countByState, insertLog, listLogs }
createInMemoryCardStore(): CardStore
createPostgresCardStore(db: Database): CardStore                      // db is the handle from createDb in @stufen/db

// Types and errors
StoredReviewCard        // contracts ReviewCard plus language, scheduledDays, learningSteps
CardNotFoundError       // thrown by review when the item was never introduced
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

### Options

| Option | Default | Meaning |
|--------|---------|---------|
| `store` | required | A `CardStore`: `createPostgresCardStore(db)` in the app, `createInMemoryCardStore()` in unit tests. |
| `bus` | required | The event bus. `item.reviewed` is emitted here. |
| `now` | system clock | Clock for reviews and due checks. |
| `requestRetention` | `0.9` | Target chance of recall when a card comes due. |
| `maximumInterval` | `365` | Longest interval in days. |
| `enableFuzz` | `false` | Spreads due dates by a small random amount. Off so results repeat. |
| `onError` | `console.error` | Receives failures inside the `attempt.recorded` handler. |

### Behaviour

- `introduceItems` creates a new card, due now, for each item that has none. Calling it again changes nothing.
- `review` loads the card, applies the rating through ts-fsrs at the current time, saves the card, appends a review log and emits `item.reviewed`. Ratings are 1 again, 2 hard, 3 good, 4 easy. An item that was never introduced throws `CardNotFoundError`. A rating outside 1 to 4 throws `RangeError`.
- Each review log holds the rating, the time, `elapsedDays` (days since the previous review, 0 for the first), `scheduledDays` (the interval the card carried into the review) and `stateBefore`.
- `stats`: `due` counts cards due now in any state. `learning` counts states `learning` and `relearning`. `mature` counts cards in state `review` with stability of at least 21 days.
- `StoredReviewCard` adds three fields to the contracts `ReviewCard`. `language` keeps the queue and the stats per language. `scheduledDays` and `learningSteps` are what ts-fsrs needs back on the next review.

### The attempt.recorded subscription

`attach()` subscribes on the injected bus, or on the bus passed in. For each item id in the event:

1. If the user has no card for the item, one is created in the language of the event.
2. If the exercise type is `flashcard`, nothing more happens. That attempt came from the review screen, which already called `review`.
3. Otherwise the attempt is rated and goes through the same path as `review`, so it also writes a log and emits `item.reviewed`.

| Attempt | Rating |
|---------|--------|
| correct, score at least 0.9 | 3 good |
| correct, score below 0.9 | 2 hard |
| incorrect | 1 again |

A failure for one item is caught and passed to `onError`. It never reaches the bus, and the other items of the attempt are still handled.

### The Postgres adapter

`createPostgresCardStore(db)` implements `CardStore` on the tables `review_cards` and `review_logs`. `apps/web` builds it once from the handle that `createDb` returns.

- **Who is asking.** Every method opens `withUser(db, userId, fn)` for the user it acts for: the `userId` argument, or the `userId` on the card or log it is given. The statement then runs as the role `stufen_app` with row level security on, so it can only read and write that user's rows. A user id that is not a uuid is rejected with a `TypeError` before any query runs.
- **How language is derived.** `review_cards` has no language column. A card's `language` is the language of its item: every read joins `items` and takes `items.language_code`. `listDue` and `countByState` filter on that joined column. On a write the `language` field of the card is not stored. If a caller introduces a French item and says Dutch, the card reads back as French.
- **What must exist first.** The user needs a row in `profiles` (created by `ensure_profile` at sign up) and the item a row in `items`. Otherwise the write fails with the Postgres foreign key error 23503.
- **Columns.** `scheduledDays` is `scheduled_days` and `learningSteps` is `learning_steps`, both from migration 0005. `updated_at` is left to the database. The mapping between rows and stored shapes is at the top of `src/postgres-store.ts` and nowhere else.
- **Upsert.** `upsertCard` is one `insert ... on conflict (user_id, item_id) do update`.
- **Queue and counts.** `listDue` orders by `due`, then `item_id`, and applies the limit in SQL. `countByState` is one grouped query. Mature means state `review` with stability of at least 21 days, as in memory.
- **Number precision.** `stability`, `difficulty`, `scheduled_days` and the two day counts of a log are `double precision` columns since migration 0006. That is the same 8 byte float a JavaScript number is, so every number comes back exactly as it was written: 15.69105055 is read as 15.69105055. A run of reviews on Postgres gives the same cards and logs, digit for digit, as the same run in memory, and the integration test checks that. Timestamps are `timestamptz` and come back as the same ISO strings that were written. The database must have migration 0006 applied; on the older `real` columns values came back rounded to about 7 significant digits.
- **Log order.** `listLogs` orders by `reviewed_at`. `review_logs` has no insertion counter, so two logs of one card with the same `reviewed_at` come back in row id order.

### Where the code lives

| File | What |
|------|------|
| `src/index.ts` | The public surface. |
| `src/srs.ts` | The factory and the scheduling logic. |
| `src/store.ts` | The `CardStore` port and the in memory adapter. |
| `src/postgres-store.ts` | The Postgres adapter and the only mapping between table rows and stored shapes. |
| `src/mapping.ts` | The only file that maps between ts-fsrs shapes and stored shapes. |

## Owns tables

| Table |
|-------|
| `review_cards` |
| `review_logs` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `item.reviewed` |
| listens | `attempt.recorded` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-srs/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-srs): message`.

## How to test it

```
pnpm --filter @stufen/core-srs test
```

That runs the unit tests and the `CardStore` contract (`tests/store-contract.ts`) against the in memory adapter. The integration test in `tests/postgres-store.integration.test.ts` is skipped.

To run the integration test too, point `DATABASE_URL` at a PostgreSQL that has all migrations applied (`pnpm db:migrate`) and whose login user owns the tables:

```
DATABASE_URL=postgres://stufen@localhost:5497/stufen_srs pnpm --filter @stufen/core-srs test
```

It runs the same contract on Postgres, then the whole `createSrs` service on the Postgres store, and checks inside `withUser` that one user cannot read or write another user's cards and logs. As the owner it creates its own rows in `users` and `items` with random ids and deletes exactly those rows at the end, so it is safe on a database that holds other data.

## Status

See the `core-srs` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
