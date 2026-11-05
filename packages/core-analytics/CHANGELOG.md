# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `EventStore` port (`insert`, `list(filter?)`, `count(name?)`), the `AnalyticsEvent` row type (`id`, `userId` or null, `name`, `props`, `createdAt`), `EventFilter` (`name`, `userId`, `since`), and `createInMemoryEventStore()` for unit tests. Rows are copied in and out.
- `src/analytics.ts`: `createAnalytics({ store, now?, newId?, sampleRate?, random?, onError? })` returning `{ attach, track }`. No module level state.
- `attach(bus)` subscribes with `onAny` and writes one row per event. `userId` comes from `payload.userId` when it is a string, otherwise null. The rest of the payload becomes `props`. It returns the unsubscribe function. A store failure is caught and sent to `onError(error, eventName)`, default `console.error`, so it never reaches the bus.
- `track(userId, name, props?)` writes one row. The name must be 1 to 100 characters of lowercase letters, digits, dot and underscore. An invalid name or a store failure rejects.
- `sampleRate` from 0 to 1, default 1. An event is kept when `random()` is below the rate. A rate outside the range throws a `RangeError` when the factory is called. Sampling applies to `attach` and to `track`.
- `tests/analytics.test.ts`: emitting `user.signed_up` stores one row with that name, events without `userId` store null, props exclude `userId`, unsubscribe stops writes, a failing store does not break `emit` and calls `onError`, `track` name validation, `sampleRate` 0 stores nothing, in memory store filters and counts.
