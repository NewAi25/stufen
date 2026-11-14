import 'server-only';

// The lesson flow, kept free of Next so it can be tested with a real
// container. The first three functions are the flow on the boxes. The lesson
// page (row P1-19) calls openLesson, submitLessonAnswer and completeLesson,
// which wrap them and answer with plain data for the screen. The page and
// the tests take the same path.

import type { Exercise, LessonSession } from '@stufen/contracts';
import { InvalidResponseError } from '@stufen/core-exercise-types';
import {
  OutOfOrderError,
  SessionAccessError,
  SessionIncompleteError,
} from '@stufen/core-lesson-engine';
import type { CompletedSessionResult, SubmitAnswerResult } from '@stufen/core-lesson-engine';
import { isSelfCheckType } from '../../lib/lesson-view';
import type {
  AnswerOutcome,
  ExerciseView,
  FinishOutcome,
  LessonSummaryView,
  LessonView,
} from '../../lib/lesson-view';
import { selfCheckContent } from '../../lib/self-check';
import type { Container } from '../container';
import { isProvisionalFeedback } from '../grading';

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

/** The exercise as the screen shows it. */
export function toExerciseView(exercise: Exercise): ExerciseView {
  return {
    id: exercise.id,
    type: exercise.type,
    payload: exercise.payload,
    instruction: exercise.instructionEn ?? null,
    selfCheck: isSelfCheckType(exercise.type)
      ? selfCheckContent(exercise.type, exercise.payload)
      : null,
  };
}

/** The summary of a finished session. Self checks are counted apart from the score. */
async function summaryOf(
  container: Container,
  userId: string,
  result: CompletedSessionResult,
): Promise<LessonSummaryView> {
  const found = await container.getLesson(result.lessonId);
  const exercises = found?.lesson.exercises ?? [];
  const selfChecked = exercises.filter((entry) => !container.exerciseTypes.hasType(entry.type));
  // A self check is stored as correct, so it is taken out of both numbers.
  const checked = Math.max(0, result.attempts - selfChecked.length);
  const next =
    found === null ? null : await container.curriculum.nextLessonFor(userId, found.language);
  return {
    lessonId: result.lessonId,
    lessonTitle: found?.lesson.title ?? '',
    language: found?.language ?? '',
    checked,
    correct: Math.min(checked, Math.max(0, result.correct - selfChecked.length)),
    selfChecked: Math.min(result.attempts, selfChecked.length),
    newReviewItems: result.introducesItemIds.length,
    next: next === null ? null : { id: next.id, title: next.title },
  };
}

/** Engine errors a learner can run into, as a sentence. Anything else is rethrown. */
function messageFor(error: unknown): string {
  if (error instanceof SessionAccessError) {
    return 'This lesson session could not be found. Open the lesson again from home.';
  }
  if (error instanceof OutOfOrderError) {
    return 'This exercise is already answered. Reload the page to continue where you are.';
  }
  if (error instanceof InvalidResponseError) {
    return 'Your answer could not be graded. Try again.';
  }
  if (error instanceof SessionIncompleteError) {
    return 'Some exercises are not answered yet. Reload the page to continue.';
  }
  throw error;
}

/**
 * Opens the lesson for the screen: starts a session or resumes the unfinished
 * one, and says which exercise comes now. Null for a lesson id that does not
 * exist. A session whose exercises are all answered is finished here, so the
 * screen shows its summary.
 */
export async function openLesson(
  container: Container,
  userId: string,
  lessonId: string,
): Promise<LessonView | null> {
  await container.ready;
  const found = await container.getLesson(lessonId);
  if (found === null) return null;

  const session = await startLesson(container, userId, lessonId);
  const current = await container.lessonEngine.currentExercise(userId, session.id);
  if (current === null) {
    const result = await finishLesson(container, userId, session.id);
    return { status: 'done', summary: await summaryOf(container, userId, result) };
  }

  const known = new Set(found.lesson.exercises.map((exercise) => exercise.id));
  const order = session.exerciseOrder.filter((id) => known.has(id));
  return {
    status: 'in_progress',
    sessionId: session.id,
    lessonId,
    lessonTitle: found.lesson.title,
    language: found.language,
    total: order.length,
    position: order.indexOf(current.id) + 1,
    exercise: toExerciseView(current),
  };
}

/** Grades one answer and says what comes next. Never throws for a learner's mistake. */
export async function submitLessonAnswer(
  container: Container,
  userId: string,
  sessionId: string,
  exerciseId: string,
  response: unknown,
): Promise<AnswerOutcome> {
  try {
    const { grade, next } = await answerExercise(
      container,
      userId,
      sessionId,
      exerciseId,
      response,
    );
    return {
      ok: true,
      result: {
        correct: grade.correct,
        score: grade.score,
        feedback: grade.feedback,
        provisional: isProvisionalFeedback(grade.feedback),
      },
      next: next === null ? null : toExerciseView(next),
    };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/** Finishes the session, fills the review box and returns the summary. */
export async function completeLesson(
  container: Container,
  userId: string,
  sessionId: string,
): Promise<FinishOutcome> {
  try {
    const result = await finishLesson(container, userId, sessionId);
    return { ok: true, summary: await summaryOf(container, userId, result) };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}
