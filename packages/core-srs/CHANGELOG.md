# Changelog

## [Unreleased]

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
