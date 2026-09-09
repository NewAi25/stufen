# @stufen/contracts

## Purpose

Shared types, event names and interfaces that every box imports.
No logic, no database access, no dependencies.

Kind: `contracts`. May import: nothing.

## Public API

Everything is exported from `src/index.ts`. There are two source files.

`src/types.ts`

- Unions: `LanguageCode`, `CefrLevel`, `Skill`, `ExerciseTypeId`, `ErrorType`, `FeatureKey`, `LimitKey`, `ReviewRating`.
- Runtime arrays for the unions so code can iterate them: `LANGUAGE_CODES`, `CEFR_LEVELS`, `SKILLS`, `EXERCISE_TYPES`, `ERROR_TYPES`, `FEATURE_KEYS`, `LIMIT_KEYS`.
- Grading: `GradeResult`, `Feedback`, `Correction`, `GradeContext`, `AiGrader`.
- Interfaces boxes implement: `LanguagePack`, `LanguageRules`, `ExerciseTypeDefinition`, `SpeechProvider`, `PaymentProvider`.
- Domain shapes returned by box APIs: `Profile`, `ProfileEditable`, `LearnerLanguage`, `Cando`, `Unit`, `LessonSummary`, `Lesson`, `Exercise`, `Item`, `LessonSession`, `SessionResult`, `StandaloneAttempt`, `ReviewCard`, `CandoMastery`, `LevelEstimate`, `Streak`, `LevelMap`, `Assessment`, `AssessmentResult`, `Question`, `Conversation`, `TutorChunk`, `WritingGrade`, `Recording`, `WordDiff`, `FeedbackItem`, `Entitlement`, `ExamFormat`, `ExamFormatId`.
- Pack input shapes read from `content/<lang>/`: `PackManifest`, `CandoInput`, `ItemInput`, `UnitInput`, `ValidationReport`, `InstallReport`.
- `JSONSchema`, a loose object alias for exercise payload schemas.

`src/events.ts`

- `EventMap`: the fourteen event names and their payloads.
- `EventName`: `keyof EventMap`.
- `EventBus`: `emit`, `on`, `onAny`. Interface only. The in process implementation arrives with P0-11.

Field names follow `docs/03-data-schema.md` in camelCase. Pack input shapes keep the snake_case of the JSON files they are read from. Shapes that `docs/04` does not spell out carry the comment "shape may grow".

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/contracts/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(contracts): message`.

## How to test it

```
pnpm --filter @stufen/contracts test
```

## Status

See the `contracts` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
