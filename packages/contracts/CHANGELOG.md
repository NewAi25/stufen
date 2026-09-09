# Changelog

## [Unreleased]

## [0.1.0] - 2026-09-09

### Added
- `src/types.ts`: shared unions (`LanguageCode`, `CefrLevel`, `Skill`, `ExerciseTypeId`, `ErrorType`) with runtime const arrays, `GradeResult`, `GradeContext`, `LanguageRules`, `LanguagePack`, `ExerciseTypeDefinition`, `SpeechProvider`, `PaymentProvider`, and the domain shapes named in `docs/04`.
- `src/events.ts`: `EventMap` with all fourteen events, `EventName`, and the `EventBus` interface (`emit`, `on`, `onAny`). No implementation; that is P0-11.
- `tests/events.test.ts`: type level check that every event in `docs/04` is a key of `EventMap`, and that `EventMap` has no extra keys.
- `tests/types.test.ts`: const arrays hold the expected members in order.
