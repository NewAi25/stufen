# Changelog

## [Unreleased]

## [0.2.1] - 2026-11-11

### Changed
- Follows migration 0006, which makes `review_cards.stability`, `difficulty` and `scheduled_days` and `review_logs.elapsed_days` and `scheduled_days` `double precision`. Numbers now come back from Postgres exactly as written. The adapter code is unchanged; only its comment on precision is.
- `tests/store-contract.ts`: the round trips use numbers that do not fit a 4 byte float (15.69105055, 1 / 3, 0.1 + 0.2) and compare exactly, for both adapters.
- `tests/postgres-store.integration.test.ts`: every card and log comparison is exact equality. The helper that allowed for rounding is gone. The test that pinned the rounding to about 7 significant digits is replaced by one that runs six reviews on Postgres and in memory and expects identical cards and logs.
- README: the note on number precision describes the `double precision` columns.

## [0.2.0] - 2026-11-11

### Added
- `src/postgres-store.ts`: `createPostgresCardStore(db)`, the Postgres adapter for the `CardStore` port (row P1-30). Every method runs inside `withUser(db, userId, fn)` for the user it acts for, so row level security applies to each statement. Exported from `src/index.ts`.
- A card's `language` is read by joining `items` on `items.language_code`. `review_cards` has no language column. The due queue and the counts filter on the joined column. On a write the `language` of the card is not stored; the item decides.
- `scheduledDays` and `learningSteps` are stored in `review_cards.scheduled_days` and `review_cards.learning_steps` (migration 0005).
- `upsertCard` is one `insert ... on conflict (user_id, item_id) do update`. `listDue` orders by `due`, then `item_id`, and applies the limit in SQL. `countByState` is one grouped query and returns the same shape as the in memory adapter.
- `tests/store-contract.ts`: `runCardStoreContract(name, makeHarness)`, the behaviour both adapters share. `tests/store-contract.memory.test.ts` runs it in memory. `tests/postgres-store.integration.test.ts` runs it on a real database, then runs `createSrs` on the Postgres store and checks row security between two users. The integration test is skipped when `DATABASE_URL` is not set.

### Changed
- In memory `listLogs` now sorts by `reviewedAt`, oldest first, as the port has always said. Before, it returned the logs in the order they were written. Logs with the same `reviewedAt` keep their written order. The port comment now says that the order of such ties is up to the adapter.

## [0.1.0] - 2026-11-06

### Added
- `src/store.ts`: the `CardStore` port (`getCard`, `upsertCard`, `listDue`, `countByState`, `insertLog`, `listLogs`) and `createInMemoryCardStore()`. `listDue` returns cards due at or before `now`, oldest due date first, ties in `itemId` order. The in memory adapter copies rows on the way in and out.
- `StoredReviewCard`: the contracts `ReviewCard` plus `language`, `scheduledDays` and `learningSteps`. The language makes the queue and the stats per language. The other two are what ts-fsrs needs back on the next review.
- `src/mapping.ts`: the only place where ts-fsrs shapes meet stored shapes. Cards, states and ratings are mapped field by field in both directions.
- `src/srs.ts`: `createSrs({ store, bus, now?, requestRetention?, maximumInterval?, enableFuzz?, onError? })` returning `dueQueue`, `review`, `introduceItems`, `stats` and `attach`. Defaults: retention 0.9, longest interval 365 days, fuzz off, default FSRS weights. Everything is injected; there is no module level state.
- `review(userId, itemId, rating)` applies the rating through ts-fsrs at the injected time, saves the card, appends a review log (`elapsedDays`, `scheduledDays`, `stateBefore`) and emits `item.reviewed`. It throws `CardNotFoundError` for an item that was never introduced and `RangeError` for a rating outside 1 to 4.
- `introduceItems(userId, language, itemIds)` creates a new card, due now, for each item that has none. Repeating it changes nothing.
- `stats(userId, language)` returns `{ due, learning, mature }`. Learning counts states `learning` and `relearning`. Mature means state `review` with stability of at least 21 days.
- `attach(bus?)` subscribes to `attempt.recorded` and returns the unsubscribe function (row P1-15). Each item of the attempt gets a card if it has none, in the language of the event. Then the attempt is rated: correct with a score of at least 0.9 is good (3), correct below 0.9 is hard (2), incorrect is again (1). Attempts with exercise type `flashcard` are not rated, because the review screen already called `review`. A failure for one item is caught, reported through `onError`, and never reaches the bus.
- `tests/srs.test.ts` and `tests/mapping.test.ts`: both acceptance checks (rating 1 then 3 then 3 moves a card from `new` to `review` with `due` moving forward; an `attempt.recorded` event with one item id creates a card), idempotent introduce, lapses, queue order, limit and language separation, stats, the unknown card error, `item.reviewed`, the derived ratings at their boundary values, skipped flashcard attempts, a failing store inside the handler, and the mapping round trip.
