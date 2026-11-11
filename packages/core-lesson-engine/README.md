# @stufen/core-lesson-engine

## Purpose

Runs a lesson session: fixes the order of the exercises, grades each answer through an injected grader, records the attempt and tells the rest of the app through events.
The single writer of `attempts`. Other boxes learn about attempts through events.
It knows nothing about where lessons come from or how an exercise type is graded. Both arrive as functions.

Kind: `core`. May import: `contracts`, `db`.

## Public API

```ts
createLessonEngine({ store, bus, getLesson, grade, now?, newId? }) => {
  startSession(userId, lessonId): Promise<LessonSession>
  currentExercise(userId, sessionId): Promise<Exercise | null>
  submitAnswer(userId, sessionId, exerciseId, response, durationMs?):
    Promise<{ grade: GradeResult; next: Exercise | null }>              // emits attempt.recorded
  completeSession(userId, sessionId): Promise<CompletedSessionResult>  // emits lesson.completed
  recordStandaloneAttempt(userId, input: StandaloneAttempt): Promise<void>   // emits attempt.recorded
  completedLessonIds(userId): Promise<string[]>
}

// injected by the composition root
getLesson(lessonId): Promise<{ lesson: Lesson; language: LanguageCode } | null>    // from core-curriculum
grade(exercise: Exercise, response: unknown, language: LanguageCode): Promise<GradeResult>   // from core-exercise-types

createInMemorySessionStore(): SessionStore
createPostgresSessionStore(db): SessionStore

// SessionResult from contracts plus the items the lesson introduces
interface CompletedSessionResult extends SessionResult { introducesItemIds: string[] }

// errors
LessonNotFoundError, SessionAccessError, OutOfOrderError, SessionIncompleteError,
AttemptValidationError, DuplicateAttemptError
```

`now` defaults to the system clock and `newId` to `crypto.randomUUID()`. On the Postgres store ids must be uuids.

Every method that takes a `sessionId` takes the acting `userId` first. This differs from the signatures in `docs/04-module-contracts.md`, which do not show the user id yet.

### Session rules

1. **Starting.** `startSession` asks `getLesson` for the lesson. If there is none it throws `LessonNotFoundError`. If the user already has an unfinished session for that lesson, that session is returned and no new one is created. Otherwise a session is created whose exercise order is the lesson's exercises sorted by ordinal. A completed session is never resumed; starting the lesson again creates a fresh one. A user has at most one unfinished session per lesson, also when several `startSession` calls arrive at the same moment: all of them get the same session.
2. **Whose session.** A session belongs to the user who started it. `currentExercise`, `submitAnswer` and `completeSession` throw `SessionAccessError` when the acting user has no session with that id. An unknown id and somebody else's session give the same error, because the store shows a user only the own rows.
3. **Current exercise.** The current exercise is the first one in the session order that has no attempt in this session. When all are answered it is null. An exercise that the lesson no longer contains is skipped.
4. **Answering.** `submitAnswer` accepts only the current exercise. Anything else throws `OutOfOrderError` with a `reason`: `not_in_session`, `already_answered` or `not_current`, and with `expectedExerciseId`. An exercise is answered once per session. There is no retry inside a session. A double submit of the same exercise stores one attempt and emits one event; the other call gets `OutOfOrderError`.
5. **Grading.** The answer goes to `grade`. If `grade` throws, the error is passed on, nothing is stored, nothing is emitted, and the exercise stays current. A result that breaks the `GradeResult` contract (no boolean `correct`, a score outside 0 to 1, no feedback) is refused with `AttemptValidationError`.
6. **Recording.** The attempt is stored with the response and the feedback, then `attempt.recorded` is emitted with `userId`, `attemptId`, `exerciseType`, `correct`, `score`, the `candoIds` and `itemIds` of the exercise, and the `language`. The call returns the grade and the next exercise, or `next: null` after the last one.
7. **Completing.** `completeSession` throws `SessionIncompleteError` (with `remainingExerciseIds`) while any exercise is unanswered. Otherwise it sets `completedAt` and the score, which is the mean of the attempt scores, and emits `lesson.completed` with `userId`, `lessonId` and `score`. Calling it again returns the same result and emits nothing. When several calls arrive at the same moment, one of them closes the session and emits; the others return the result that one stored. A lesson without exercises completes with score 0.
8. **Introduced items.** The result of `completeSession` carries `introducesItemIds`, the lesson's own list from `getLesson` (an empty list when the lesson names none). The `lesson.completed` event has no field for them, so the composition root takes them from the result and hands them to the review box. They are returned on every call, not only the first, so adding them to the review queue must be safe to repeat. If the lesson no longer exists when a completed session is asked for again, the list is empty.
9. **Standalone attempts.** `recordStandaloneAttempt` is for reviews, tutor tasks and assessments. It stores an attempt with no session and emits `attempt.recorded`. The input is checked first: `language` is a `LanguageCode`, `exerciseType` is an `ExerciseTypeId`, `correct` is a boolean, `score` is a number from 0 to 1, `candoIds` and `itemIds` are lists of strings, `durationMs` is a whole number of 0 or more. A broken rule throws `AttemptValidationError` with the `field`, and nothing is stored.
10. **Scores.** Scores are rounded to three decimals before they are stored, emitted or returned, because the columns are `numeric(4,3)`.
11. **Responses.** A response must be a JSON value. It is stored as its JSON round trip; a missing response is stored as null.

### Storage port

```ts
interface SessionStore {
  insertSession(session: StoredSession): Promise<StoredSession>
  getSession(userId, id): Promise<StoredSession | null>
  updateSession(userId, id, patch: { completedAt?; score? }): Promise<StoredSession | null>
  closeSession(userId, id, { completedAt, score }): Promise<{ session: StoredSession; closed: boolean } | null>
  listSessionsByUser(userId): Promise<StoredSession[]>            // oldest first
  insertAttempt(attempt: StoredAttempt): Promise<StoredAttempt>
  listAttemptsBySession(userId, sessionId): Promise<StoredAttempt[]>   // oldest first
  listAttemptsByUser(userId, limit?): Promise<StoredAttempt[]>         // newest first
  completedLessonIds(userId): Promise<string[]>                   // distinct, ascending
}
```

`StoredSession` is the contracts `LessonSession` plus `language`. `StoredAttempt` is one row of `attempts`. Both adapters keep the caller's ids and timestamps, never show one user another user's rows, refuse an attempt that points at a session of another user, and refuse a second attempt for the same session and exercise with `DuplicateAttemptError`.

Two methods are built for calls that race. `insertSession` returns the user's unfinished session for the lesson when there already is one, instead of adding a second. `closeSession` sets `completedAt` and `score` only while the session is unfinished and says with `closed` whether this call did it. The engine completes sessions through `closeSession`; `updateSession` is a plain patch and is not used for that.

### The Postgres store

Every method runs inside `withUser(db, userId, fn)` as the restricted role `stufen_app`, so the row level security policies decide which rows a call can see or change. The owner connection is never used for learner data. One mapping in `src/postgres-store.ts` knows the column names: timestamps become ISO strings, numeric scores become numbers, and a feedback of `{}` (the column default) reads as null.

`lesson_sessions` has no language column. The language of a session is read from `units.language_code` through the lesson on every read, and the `language` handed to `insertSession` is not stored. `attempts` has no language column either, so the language of a standalone attempt travels only in the event.

The store needs migration 0006. The database itself now keeps three rules, and the store builds on them: the unique index `lesson_sessions_one_open_key` (one unfinished session per user and lesson; the insert uses `on conflict do nothing` on it and then reads the session that was in the way), the unique index `attempts_session_exercise_key` (one attempt per session and exercise; its error 23505 becomes `DuplicateAttemptError`), and the insert policy on `attempts` (an attempt may only point at an own session; the store checks this first for a clear message, and the policy refuses with 42501 if the check is bypassed). Content tables are read only for the app role, and this box only reads them.

The user needs a `profiles` row (core-auth calls `ensure_profile` at sign up), and the lesson, exercise and item ids must exist in the content tables, because the tables reference them.

### Known limits

- `GradeResult.errorTypes` is returned to the caller but not stored. The `attempts` table has no column for it.

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

That runs the unit tests. They need no database, and the integration test is reported as skipped.

| File | What it checks |
|------|----------------|
| `tests/fixtures.ts` | Not a test file. A lesson of four exercises and a fake grader |
| `tests/engine.test.ts` | Every session rule above on the in memory store, with the real bus and exact event payloads |
| `tests/store-contract.ts` | Not a test file. `runSessionStoreContract(name, makeHarness)` holds the behaviour every `SessionStore` adapter must show |
| `tests/store-contract.memory.test.ts` | Runs the contract for the in memory store |
| `tests/postgres-store.integration.test.ts` | Runs the contract and the whole engine on Postgres, proves the row security and shows the database guards of migration 0006. Skipped unless `DATABASE_URL` is set |

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. `packages/db/README.md` says how to start one. Then:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-lesson-engine test
```

As the owner it creates its own users (a `users` row, then `ensure_profile`) and its own content with random ids and slugs: one unit in `nl`, two lessons and four exercises. It deletes exactly those rows at the end.

## Status

See the `core-lesson-engine` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
