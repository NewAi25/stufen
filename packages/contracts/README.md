# @stufen/contracts

## Purpose

Shared types, event names and interfaces that every box imports.
No logic, no database access, no dependencies.

Kind: `contracts`. May import: nothing.

## Public API

Everything is exported from `src/index.ts`. There are three source files.

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
- `EventBus`: `emit`, `on`, `onAny`. The interface every box codes against.

`src/bus.ts`

- `createEventBus(options?)`: the in process implementation of `EventBus`. No queue. `emit` awaits every matching `on` handler and every `onAny` handler, run concurrently. A handler subscribed during an emit does not receive that emit. `on` and `onAny` return an unsubscribe function that is safe to call more than once.
- `InProcessEventBus`: the return type. It is `EventBus` plus `listenerCount(name?)`, which returns the live subscriptions for one event, or for every event plus `onAny` when the name is omitted. Meant for tests and debugging, not for box logic.
- `EventBusOptions` and `EventBusErrorHandler`: see the note on errors below.

```ts
const bus = createEventBus();
const off = bus.on('user.signed_up', async ({ userId }) => console.log(userId));
await bus.emit('user.signed_up', { userId: 'u1' });
off();
```

Errors: a handler that throws or rejects does not stop the other handlers, and `emit` never rethrows. Each failure is passed to `options.onError(name, error, handlerLabel)` once. The default writes the event name and the error to `console.error`. Pass your own `onError` to route failures to a logger.

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
