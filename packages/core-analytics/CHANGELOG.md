# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added
- `src/postgres-store.ts`: `createPostgresEventStore(db)`, the Postgres adapter for the `EventStore` port on the `events` table. Exported from `src/index.ts`.
- `insert` runs inside `withUser(db, event.userId ?? null, ...)` as the restricted role `stufen_app`, so the `events_insert` policy from migration 0003 decides whether the row goes in. The event's `id` and `createdAt` are written as given. `props` is written as JSON text into the `jsonb` column, so nested arrays and objects arrive unchanged.
- A user id without a profile does not lose the event. `events.user_id` references `profiles(id)`, so such an insert fails on the foreign key (Postgres code 23503). The adapter retries once with `user_id` null and keeps the id it was given in `props.original_user_id`. A user id that is not a uuid takes the same road without the first attempt, because `withUser` and the uuid column would both reject it. Any other failure is passed on.
- `list` and `count` run as owner on `db` directly, because the app role can never read `events`. `list` applies `name`, `userId` (null matches rows without a user) and `since`, and orders by `created_at`, then `id`.
- `tests/store-contract.ts`: `runEventStoreContract(name, makeStore, makeUserId)`, 10 checks both adapters must pass: insert then list by name, unknown name, oldest first, filter by user, by since, combined filters, null user, count by name, count of everything, nested props.
- `tests/in-memory-store.test.ts`: runs the contract for the in memory store.
- `tests/postgres-store.integration.test.ts`: skipped unless `DATABASE_URL` is set. Runs the contract on a real Postgres and adds 10 checks: the `createAnalytics` facade on a real bus stores `user.signed_up` for a real user and an anonymous `feedback.submitted`, `track` for a real user, an unknown user id, a user id that is not a uuid, a deleted user, props as an object, empty props, a forged user id refused by the database, and the app role unable to read events. It creates its own users and deletes exactly the events and users it created.

### Changed
- `createInMemoryEventStore().list` now sorts by `createdAt`, oldest first, as the port says. Before, it returned insert order, which is the same thing only when events arrive in clock order. The sort is stable, so rows with the same time keep insert order.

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `EventStore` port (`insert`, `list(filter?)`, `count(name?)`), the `AnalyticsEvent` row type (`id`, `userId` or null, `name`, `props`, `createdAt`), `EventFilter` (`name`, `userId`, `since`), and `createInMemoryEventStore()` for unit tests. Rows are copied in and out.
- `src/analytics.ts`: `createAnalytics({ store, now?, newId?, sampleRate?, random?, onError? })` returning `{ attach, track }`. No module level state.
- `attach(bus)` subscribes with `onAny` and writes one row per event. `userId` comes from `payload.userId` when it is a string, otherwise null. The rest of the payload becomes `props`. It returns the unsubscribe function. A store failure is caught and sent to `onError(error, eventName)`, default `console.error`, so it never reaches the bus.
- `track(userId, name, props?)` writes one row. The name must be 1 to 100 characters of lowercase letters, digits, dot and underscore. An invalid name or a store failure rejects.
- `sampleRate` from 0 to 1, default 1. An event is kept when `random()` is below the rate. A rate outside the range throws a `RangeError` when the factory is called. Sampling applies to `attach` and to `track`.
- `tests/analytics.test.ts`: emitting `user.signed_up` stores one row with that name, events without `userId` store null, props exclude `userId`, unsubscribe stops writes, a failing store does not break `emit` and calls `onError`, `track` name validation, `sampleRate` 0 stores nothing, in memory store filters and counts.
