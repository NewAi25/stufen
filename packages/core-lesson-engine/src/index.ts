// @stufen/core-lesson-engine
// Runs a lesson session: orders exercises, grades answers through an injected
// grader, records attempts. The single writer of `attempts`.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see the core-lesson-engine row in docs/07-build-sequence.md.

export { createInMemorySessionStore, DuplicateAttemptError } from './store';
export type { SessionPatch, SessionStore, StoredAttempt, StoredSession } from './store';
export { createLessonEngine } from './engine';
export type {
  CreateLessonEngineOptions,
  LessonEngine,
  LessonWithLanguage,
  SubmitAnswerResult,
} from './engine';
export {
  AttemptValidationError,
  LessonNotFoundError,
  OutOfOrderError,
  SessionAccessError,
  SessionIncompleteError,
} from './errors';
export type { AttemptField, OutOfOrderReason } from './errors';
export { createPostgresSessionStore } from './postgres-store';
