# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added
- `src/postgres-store.ts`: `createPostgresFeedbackStore(db)`, the Postgres adapter for the `FeedbackStore` port, exported from `src/index.ts`. It imports only `@stufen/contracts` and `@stufen/db`.
- Access model. `insert` and `listByUser` run inside `withUser` as the restricted role `stufen_app`, so the row level security policies of migration 0001 decide: anyone may insert, a signed in user only in the own name, and a learner reads only own rows. `listAll` and `updateStatus` are owner work for a later admin view and use the connection directly.
- One mapping between the `feedback` row and `FeedbackItem`: `created_at` becomes an ISO string, a null `page` reads as an empty string, and a context of `{}` (the column default, since the column has no null) reads as `null`.
- `insert` rejects a duplicate id with the same message as the in memory store, and throws a `TypeError` before any query for an id or a `userId` that is not a uuid. `listByUser` and `updateStatus` treat a non uuid as unknown and return an empty list and null.
- `tests/store-contract.ts`: `runFeedbackStoreContract(name, makeStore, makeUserId)`, eleven checks of the behaviour both adapters share. It runs for the in memory store in `tests/feedback.test.ts` and for Postgres in the integration test.
- `tests/postgres-store.integration.test.ts`: skipped unless `DATABASE_URL` is set. Runs the contract on a real PostgreSQL, proves the row security at the database level, runs the `createFeedback` facade on the Postgres store, and checks that deleting a user keeps the feedback with `user_id` null. It deletes the users and rows it created.

### Changed
- The `FeedbackStore` port no longer promises "later insert first" for rows with the same `createdAt`. The order of such rows is up to the adapter and must be stable. The in memory store still puts the later insert first. The Postgres store orders them by descending id, because the table has no insert counter.

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `FeedbackStore` port (`insert`, `listByUser`, `listAll(filter?)`, `updateStatus`) and `createInMemoryFeedbackStore()`. Lists come back newest first by `createdAt`; rows with the same timestamp come back with the later insert first. The in memory adapter copies rows on the way in and out and rejects a duplicate id.
- `src/feedback.ts`: `createFeedback({ store, bus, now?, newId? })` returning `submit`, `listMine` and `setStatus`. Everything is injected; there is no module level state.
- `submit` accepts anonymous feedback (`userId` omitted, undefined or null), stores the row with status `new` and emits `feedback.submitted` with `feedbackId` and `kind`. A rejected submit stores nothing and emits nothing.
- `FeedbackValidationError` with a `field` name. Rules: `kind` is a `FeedbackKind`; `message` is trimmed and 1 to 4000 characters, and may be empty only when `kind` is `rating`; `rating` is a whole number 1 to 5 and required when `kind` is `rating`; `page` is at most 300 characters; `context` is a plain object that serialises to at most 8000 characters; `userId` is a non empty string when given.
- `listMine(userId)` returns that user's rows newest first and never returns anonymous rows.
- `setStatus(id, status)` for a later admin view. Returns the updated row, or null for an unknown id.
- `tests/feedback.test.ts`: the acceptance check (anonymous `submit` inserts a row and emits `feedback.submitted`), signed in rows in `listMine`, anonymous rows in nobody's `listMine`, every validation rule with its boundary values, ordering with an injected clock, `setStatus`, and the in memory store.
