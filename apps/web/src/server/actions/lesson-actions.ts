import 'server-only';

// The lesson flow, kept free of Next so it can be tested with a real
// container. The lesson page (row P1-19) calls these three functions and
// nothing else, so the page and the tests take the same path.

import type { LessonSession } from '@stufen/contracts';
import type { CompletedSessionResult, SubmitAnswerResult } from '@stufen/core-lesson-engine';
import type { Container } from '../container';

/** Starts the lesson, or returns the learner's unfinished session for it. */
export async function startLesson(
  container: Container,
  userId: string,
  lessonId: string,
): Promise<LessonSession> {
  await container.ready;
  return container.lessonEngine.startSession(userId, lessonId);
}

/** Grades and records one answer. Only the current exercise is accepted. */
export async function answerExercise(
  container: Container,
  userId: string,
  sessionId: string,
  exerciseId: string,
  response: unknown,
  durationMs?: number,
): Promise<SubmitAnswerResult> {
  return container.lessonEngine.submitAnswer(userId, sessionId, exerciseId, response, durationMs);
}

/**
 * Closes the session and puts the items the lesson introduces into the
 * review queue. `lesson.completed` carries no item list, so the hand over to
 * core-srs happens here. Safe to call again: the engine returns the stored
 * result and introduceItems leaves existing cards alone.
 */
export async function finishLesson(
  container: Container,
  userId: string,
  sessionId: string,
): Promise<CompletedSessionResult> {
  const result = await container.lessonEngine.completeSession(userId, sessionId);
  if (result.introducesItemIds.length > 0) {
    const found = await container.getLesson(result.lessonId);
    if (found !== null) {
      await container.srs.introduceItems(userId, found.language, result.introducesItemIds);
    }
  }
  return result;
}
