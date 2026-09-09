# @stufen/core-lesson-engine

## Purpose

Runs a lesson session: orders exercises, grades answers through the exercise type registry, records attempts.
The single writer of attempts. Other boxes learn about attempts through events.

Kind: `core`. May import: `contracts`.

## Public API

```ts
startSession(userId, lessonId): Promise<LessonSession>
currentExercise(sessionId): Promise<Exercise | null>
submitAnswer(sessionId, exerciseId, response): Promise<{ grade: GradeResult; next: Exercise | null }>
                                                          // emits attempt.recorded
completeSession(sessionId): Promise<SessionResult>       // emits lesson.completed
recordStandaloneAttempt(userId, input: StandaloneAttempt): Promise<void>  // used by srs, tutor, assessment
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `lesson_sessions` |
| `attempts` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `attempt.recorded` |
| emits | `lesson.completed` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-lesson-engine/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-lesson-engine): message`.

## How to test it

```
pnpm --filter @stufen/core-lesson-engine test
```

## Status

See the `core-lesson-engine` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
