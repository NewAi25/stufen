// Runs one lesson from start to summary through the functions the lesson
// page uses, with a correct response to every exercise.

import type { Lesson } from '@stufen/contracts';
import {
  completeLesson,
  openLesson,
  submitLessonAnswer,
} from '../../src/server/actions/lesson-actions';
import type { Container } from '../../src/server/container';
import type { LessonSummaryView } from '../../src/lib/lesson-view';
import { correctResponseFor } from './correct-response';

/** The first lesson of the German path, with its exercises. */
export async function firstLesson(container: Container): Promise<Lesson> {
  await container.ready;
  const first = (await container.curriculum.lessonPath('de'))[0];
  if (!first) throw new Error('the lesson path is empty');
  const found = await container.getLesson(first.lesson.id);
  if (!found) throw new Error('the first lesson is not stored');
  return found.lesson;
}

export async function finishWholeLesson(
  container: Container,
  userId: string,
  lesson: Lesson,
): Promise<LessonSummaryView> {
  const view = await openLesson(container, userId, lesson.id);
  if (view?.status !== 'in_progress') throw new Error('the lesson is not in progress');
  for (const exercise of lesson.exercises) {
    const outcome = await submitLessonAnswer(
      container,
      userId,
      view.sessionId,
      exercise.id,
      correctResponseFor(exercise),
    );
    if (!outcome.ok) throw new Error(`${exercise.type}: ${outcome.message}`);
  }
  const finished = await completeLesson(container, userId, view.sessionId);
  if (!finished.ok) throw new Error(finished.message);
  return finished.summary;
}
