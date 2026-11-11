# Changelog

## [Unreleased]

## [0.5.0] - 2026-11-11

### Added
- `SnapshotWriter`: the port core-content writes an installed pack through. The curriculum store implements it.

## [0.4.0] - 2026-11-06

### Added
- `CurriculumSnapshot` and `UnitWithLessons`: the installed form of a language pack, shared by core-content and core-curriculum.

## [0.3.0] - 2026-11-05

### Added
- `AuthPort`, `AuthSession`, `StoragePort`, `MailPort`, `MailMessage` in `src/ports.ts`, so boxes can depend on auth, storage and mail without importing each other.

## [0.2.0] - 2026-09-09

### Added
- `src/bus.ts`: `createEventBus(options?)`, the in process implementation of `EventBus`. `emit` snapshots the subscribers, runs every matching `on` handler and every `onAny` handler concurrently with `Promise.allSettled`, and awaits them all. A failing handler does not stop the others; each failure goes to `options.onError(name, error, handlerLabel)`, default `console.error`. `emit` never rethrows. `on` and `onAny` return an idempotent unsubscribe. Extra for tests and debugging: `listenerCount(name?)`. Exported types: `EventBusOptions`, `EventBusErrorHandler`, `InProcessEventBus`.
- `tests/bus.test.ts`: two subscribers on one event both run, `onAny` sees every emit, unsubscribe stops delivery and is safe to call twice, a throwing handler does not block the others, emit with no listeners resolves, a handler added during an emit does not receive it, `listenerCount` tracks subscriptions.

## [0.1.0] - 2026-09-09

### Added
- `src/types.ts`: shared unions (`LanguageCode`, `CefrLevel`, `Skill`, `ExerciseTypeId`, `ErrorType`) with runtime const arrays, `GradeResult`, `GradeContext`, `LanguageRules`, `LanguagePack`, `ExerciseTypeDefinition`, `SpeechProvider`, `PaymentProvider`, and the domain shapes named in `docs/04`.
- `src/events.ts`: `EventMap` with all fourteen events, `EventName`, and the `EventBus` interface (`emit`, `on`, `onAny`). No implementation; that is P0-11.
- `tests/events.test.ts`: type level check that every event in `docs/04` is a key of `EventMap`, and that `EventMap` has no extra keys.
- `tests/types.test.ts`: const arrays hold the expected members in order.
