'use server';

import { revalidatePath } from 'next/cache';
import { NOT_SIGNED_IN_MESSAGE } from '../../../lib/action-result';
import type { AnswerOutcome, FinishOutcome } from '../../../lib/lesson-view';
import { completeLesson, submitLessonAnswer } from '../../../server/actions/lesson-actions';
import { getContainer } from '../../../server/container';
import { getSession } from '../../../server/session';

// The user id always comes from the session, never from the browser. The
// engine refuses a session id that belongs to someone else.

/** Grades the answer to the current exercise of the learner's session. */
export async function submitAnswer(
  sessionId: string,
  exerciseId: string,
  response: unknown,
): Promise<AnswerOutcome> {
  const session = await getSession();
  if (!session) return { ok: false, message: NOT_SIGNED_IN_MESSAGE };
  if (typeof sessionId !== 'string' || typeof exerciseId !== 'string') {
    return { ok: false, message: 'Your answer could not be graded. Try again.' };
  }
  return submitLessonAnswer(getContainer(), session.userId, sessionId, exerciseId, response);
}

/** Finishes the session after the last exercise and returns the summary. */
export async function finishSession(sessionId: string): Promise<FinishOutcome> {
  const session = await getSession();
  if (!session) return { ok: false, message: NOT_SIGNED_IN_MESSAGE };
  if (typeof sessionId !== 'string') {
    return { ok: false, message: 'This lesson could not be finished. Reload the page.' };
  }
  const outcome = await completeLesson(getContainer(), session.userId, sessionId);
  // Home, review and progress all read what a finished lesson changes.
  if (outcome.ok) revalidatePath('/', 'layout');
  return outcome;
}
