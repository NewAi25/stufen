# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-11

Follows migration 0006, which moved the session and attempt guards into the database, and contracts 0.6.0.

### Added
- `SessionStore.closeSession(userId, id, { completedAt, score })`: completes a session only while it is unfinished and resolves `{ session, closed }`, where `closed` says whether this call did it. Null when the user has no such session. Both adapters; on Postgres it is one update with `completed_at is null` in the where clause.
- `CompletedSessionResult`: the contracts `SessionResult` plus `introducesItemIds`. `completeSession` returns it, on the first call and on every later one, so the composition root can hand the items a lesson introduces to the review box. The list is the lesson's `introducesItemIds` from `getLesson`, or empty when the lesson names none or no longer exists. The contracts types and the `lesson.completed` payload are unchanged.
- Contract tests for one unfinished session per user and lesson, for several `insertSession` calls at the same moment, and for `closeSession` including its race. Engine tests for the start race and the completion race on both stores.
- Integration tests that show the database guards with the store's own checks left out: a second unfinished session and a second attempt for the same exercise fail with 23505, an attempt on another learner's session fails with 42501, and a learner can read content but not write it.

### Changed
- `insertSession` no longer adds a second unfinished session for the same user and lesson. It resolves the one that is already there, in both adapters. Several `startSession` calls at the same moment now all get the same session. On Postgres the insert uses `on conflict do nothing` on the unique index `lesson_sessions_one_open_key` and then reads the session that was in the way.
- `completeSession` closes the session through `closeSession`. Of several calls at the same moment one closes it and emits `lesson.completed`; the others return the result that one stored and emit nothing.
- Postgres `insertAttempt`: the unique index `attempts_session_exercise_key` now decides whether a session already has an attempt for an exercise, and its error 23505 becomes `DuplicateAttemptError`. The advisory lock and the select before the insert are gone. The check that the session belongs to the user stays, and the new insert policy on `attempts` refuses the same row in the database.
- A duplicate id is told apart from the other unique indexes by the constraint name, so only a primary key violation reads as "already exists".
- The Postgres store now needs migration 0006.

### Removed
- The two known limits about `startSession` and `completeSession` calls at the same moment. Both are closed.

## [0.1.0] - 2026-11-11

Build sequence rows P1-12, P1-13 and P1-29.

### Added
- `src/store.ts`: the `SessionStore` port (`insertSession`, `getSession`, `updateSession`, `listSessionsByUser`, `insertAttempt`, `listAttemptsBySession`, `listAttemptsByUser(userId, limit?)`, `completedLessonIds`) and `createInMemorySessionStore()`. Every method acts for one user: a method that takes a session id takes the acting user id first and never shows another user's rows. A stored session keeps `userId`, `lessonId`, `language`, `startedAt`, `completedAt`, `score` and the exercise order.
- `insertAttempt` keeps two rules in both adapters: an attempt may only point at a session of the same user, and a session holds one attempt per exercise (`DuplicateAttemptError`).
- `src/engine.ts`: `createLessonEngine({ store, bus, getLesson, grade, now?, newId? })`. The lesson and the grader arrive as injected functions, so the box imports neither core-curriculum nor core-exercise-types. There is no module level state.
- `startSession(userId, lessonId)` resumes the user's unfinished session for the lesson or creates one with the exercises in ordinal order. `LessonNotFoundError` when `getLesson` returns null.
- `currentExercise(userId, sessionId)` returns the first exercise without an attempt in the session, or null.
- `submitAnswer(userId, sessionId, exerciseId, response, durationMs?)` accepts only the current exercise (`OutOfOrderError` with a `reason` of `not_in_session`, `already_answered` or `not_current`), grades it, stores the attempt with response and feedback, emits `attempt.recorded` and returns `{ grade, next }`. When the grader throws, nothing is stored or emitted.
- `completeSession(userId, sessionId)` refuses with `SessionIncompleteError` while exercises are unanswered, then sets `completedAt` and the mean score and emits `lesson.completed` once. A second call returns the same result and emits nothing.
- `recordStandaloneAttempt(userId, input)` validates the input (`AttemptValidationError` with a `field`), stores an attempt with no session and emits `attempt.recorded`.
- `completedLessonIds(userId)`: distinct lesson ids of the user's completed sessions, ascending.
- `SessionAccessError` from every method that takes a session id, when the acting user has no session with that id. An unknown id and another user's session give the same error.
- Scores are rounded to three decimals before they are stored, emitted or returned, because the score columns are `numeric(4,3)`.
- `src/postgres-store.ts`: `createPostgresSessionStore(db)`. Every method runs inside `withUser` as the restricted role `stufen_app`, so the row level security policies of migration 0001 apply. One mapping between rows and the stored shapes: timestamps become ISO strings, numeric scores become numbers, a feedback of `{}` reads as null. `lesson_sessions` has no language column, so the language is read from `units.language_code` through the lesson on every read. It imports only `@stufen/contracts` and `@stufen/db`.
- `tests/fixtures.ts`: a lesson of four exercises and a fake grader.
- `tests/engine.test.ts`: every session rule on the in memory store with the real bus, both events with exact payloads, resume, out of order, another user's session, grader failure, validation and standalone attempts.
- `tests/store-contract.ts`: `runSessionStoreContract(name, makeHarness)`, the behaviour both adapters share. It runs for the in memory store in `tests/store-contract.memory.test.ts` and for Postgres in the integration test.
- `tests/postgres-store.integration.test.ts`: skipped unless `DATABASE_URL` is set. Creates its own users and content as owner, runs the contract and the whole engine on a real PostgreSQL, proves that user B cannot read or change user A's sessions and attempts, and deletes what it created.

### Changed
- The session methods take the acting `userId` first: `currentExercise(userId, sessionId)`, `submitAnswer(userId, sessionId, exerciseId, response, durationMs?)` and `completeSession(userId, sessionId)`. `docs/04-module-contracts.md` still shows them without it.
