import { describe, expect, it } from 'vitest';
import type { Exercise } from '@stufen/contracts';
import {
  completeLesson,
  openLesson,
  submitLessonAnswer,
} from '../src/server/actions/lesson-actions';
import { createContainer } from '../src/server/container';
import type { Container } from '../src/server/container';
import { PROVISIONAL_MESSAGE } from '../src/server/grading';
import { reviewSentence, scoreSentence, selfCheckSentence } from '../src/lib/lesson-summary';
import type { LessonView } from '../src/lib/lesson-view';
import { memoryConfig } from './helpers/config';
import { correctResponseFor } from './helpers/correct-response';
import { wrongResponseFor } from './helpers/wrong-response';

// The functions behind /lesson/[id], on the real container with in memory
// stores and the German pack from disk. Nothing here counts lessons or items
// by hand, so new content does not break it.

async function setup() {
  const container = createContainer(memoryConfig());
  await container.ready;
  const session = await container.auth.createDevSession('learner@stufen.local');
  const first = (await container.curriculum.lessonPath('de'))[0];
  if (!first) throw new Error('the lesson path is empty');
  const found = await container.getLesson(first.lesson.id);
  if (!found) throw new Error('the first lesson is not stored');
  return { container, userId: session.userId, lesson: found.lesson };
}

type InProgress = Extract<LessonView, { status: 'in_progress' }>;

async function open(container: Container, userId: string, lessonId: string): Promise<InProgress> {
  const view = await openLesson(container, userId, lessonId);
  if (view?.status !== 'in_progress') throw new Error('the lesson is not in progress');
  return view;
}

/** Answers every exercise from `from` on, correctly, and returns the last outcome. */
async function answerAll(
  container: Container,
  userId: string,
  sessionId: string,
  exercises: Exercise[],
) {
  let last = null;
  for (const exercise of exercises) {
    last = await submitLessonAnswer(
      container,
      userId,
      sessionId,
      exercise.id,
      correctResponseFor(exercise),
    );
    expect(last.ok, `${exercise.type} #${exercise.ordinal}`).toBe(true);
  }
  return last;
}

describe('openLesson', () => {
  it('starts the first lesson at its first exercise', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const first = lesson.exercises[0];

    expect(view.lessonId).toBe(lesson.id);
    expect(view.lessonTitle).toBe(lesson.title);
    expect(view.language).toBe('de');
    expect(view.total).toBe(lesson.exercises.length);
    expect(view.position).toBe(1);
    expect(view.exercise).toMatchObject({ id: first?.id, type: first?.type });
    expect(view.exercise.instruction).toBe(first?.instructionEn ?? null);
    // Plain data: the view survives the trip to the browser unchanged.
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('answers null for a lesson id that does not exist', async () => {
    const { container, userId } = await setup();
    expect(await openLesson(container, userId, 'no-such-lesson')).toBeNull();
    expect(await openLesson(container, userId, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await container.stores.sessions.listSessionsByUser(userId)).toEqual([]);
  });
});

describe('submitLessonAnswer', () => {
  it('grades a correct answer and names the next exercise', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const [first, second] = lesson.exercises;
    if (!first) throw new Error('the first lesson has no exercise');

    const outcome = await submitLessonAnswer(
      container,
      userId,
      view.sessionId,
      first.id,
      correctResponseFor(first),
    );
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result).toMatchObject({ correct: true, score: 1, provisional: false });
    expect(outcome.result.feedback.message).not.toBe('');
    expect(outcome.next?.id ?? null).toBe(second?.id ?? null);
    expect(JSON.parse(JSON.stringify(outcome))).toEqual(outcome);
  });

  it('marks a wrong answer as not correct and still moves on', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const [first, second] = lesson.exercises;
    if (!first) throw new Error('the first lesson has no exercise');

    const outcome = await submitLessonAnswer(
      container,
      userId,
      view.sessionId,
      first.id,
      wrongResponseFor(first),
    );
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.correct).toBe(false);
    expect(outcome.result.score).toBeLessThan(1);
    expect(outcome.result.provisional).toBe(false);
    expect(outcome.next?.id ?? null).toBe(second?.id ?? null);

    // One answer per exercise in a session: the same exercise is refused.
    const again = await submitLessonAnswer(
      container,
      userId,
      view.sessionId,
      first.id,
      correctResponseFor(first),
    );
    expect(again.ok).toBe(false);
    const attempts = await container.stores.sessions.listAttemptsBySession(userId, view.sessionId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.correct).toBe(false);
  });

  it('answers a response the grader cannot read with a message, and stores nothing', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const outcome = await submitLessonAnswer(container, userId, view.sessionId, view.exercise.id, {
      nonsense: true,
    });
    expect(outcome).toEqual({ ok: false, message: 'Your answer could not be graded. Try again.' });
    expect((await open(container, userId, lesson.id)).position).toBe(1);
  });

  it("never opens or answers another learner's session", async () => {
    const { container, userId, lesson } = await setup();
    const mine = await open(container, userId, lesson.id);
    const other = (await container.auth.createDevSession('other@stufen.local')).userId;
    const first = lesson.exercises[0];
    if (!first) throw new Error('the first lesson has no exercise');

    // The other learner gets an own session for the same lesson.
    const theirs = await open(container, other, lesson.id);
    expect(theirs.sessionId).not.toBe(mine.sessionId);

    const answer = correctResponseFor(first);
    const stolen = await submitLessonAnswer(container, other, mine.sessionId, first.id, answer);
    expect(stolen.ok).toBe(false);
    expect((await completeLesson(container, other, mine.sessionId)).ok).toBe(false);
    expect(await container.stores.sessions.listAttemptsBySession(userId, mine.sessionId)).toEqual(
      [],
    );
  });
});

describe('leaving and coming back', () => {
  it('resumes the same session at the first unanswered exercise', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const answered = lesson.exercises.slice(0, 2);
    await answerAll(container, userId, view.sessionId, answered);

    const back = await open(container, userId, lesson.id);
    expect(back.sessionId).toBe(view.sessionId);
    expect(back.position).toBe(answered.length + 1);
    expect(back.exercise.id).toBe(lesson.exercises[answered.length]?.id);
    expect(await container.stores.sessions.listSessionsByUser(userId)).toHaveLength(1);
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([]);
  });
});

describe('completeLesson', () => {
  it('refuses to finish while exercises are open', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const outcome = await completeLesson(container, userId, view.sessionId);
    expect(outcome.ok).toBe(false);
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([]);
  });

  it('finishes the whole first lesson and returns the summary data', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const last = await answerAll(container, userId, view.sessionId, lesson.exercises);
    expect(last?.ok && last.next).toBeNull();

    const outcome = await completeLesson(container, userId, view.sessionId);
    if (!outcome.ok) throw new Error(outcome.message);
    const { summary } = outcome;
    const checked = lesson.exercises.filter((entry) => container.exerciseTypes.hasType(entry.type));
    const next = await container.curriculum.nextLessonFor(userId, 'de');

    expect(summary).toMatchObject({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      language: 'de',
      checked: checked.length,
      correct: checked.length,
      selfChecked: lesson.exercises.length - checked.length,
      newReviewItems: (lesson.introducesItemIds ?? []).length,
    });
    expect(summary.next?.id ?? null).toBe(next?.id ?? null);
    expect(summary.next?.id).not.toBe(lesson.id);
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([lesson.id]);

    // Finishing again gives the same summary. Opening the lesson again starts fresh.
    expect(await completeLesson(container, userId, view.sessionId)).toEqual(outcome);
    const again = await open(container, userId, lesson.id);
    expect(again.sessionId).not.toBe(view.sessionId);
    expect(again.position).toBe(1);
  });

  it('keeps a wrong answer and the self checks out of the number that was right', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    const wrong = lesson.exercises.find((entry) => container.exerciseTypes.hasType(entry.type));
    if (!wrong) throw new Error('the first lesson has no checked exercise');
    for (const exercise of lesson.exercises) {
      const response =
        exercise.id === wrong.id ? wrongResponseFor(exercise) : correctResponseFor(exercise);
      const outcome = await submitLessonAnswer(
        container,
        userId,
        view.sessionId,
        exercise.id,
        response,
      );
      if (!outcome.ok) throw new Error(outcome.message);
      // A task without a grader is saved with the provisional mark.
      const selfCheck = !container.exerciseTypes.hasType(exercise.type);
      expect(outcome.result.provisional, exercise.type).toBe(selfCheck);
      if (selfCheck) expect(outcome.result.feedback.message).toBe(PROVISIONAL_MESSAGE);
    }

    const outcome = await completeLesson(container, userId, view.sessionId);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.summary.correct).toBe(outcome.summary.checked - 1);
    expect(outcome.summary.checked + outcome.summary.selfChecked).toBe(lesson.exercises.length);
  });

  it('shows the summary when a session with every answer given is opened again', async () => {
    const { container, userId, lesson } = await setup();
    const view = await open(container, userId, lesson.id);
    await answerAll(container, userId, view.sessionId, lesson.exercises);

    // The learner left before Finish. Opening the lesson closes the session.
    const back = await openLesson(container, userId, lesson.id);
    expect(back?.status).toBe('done');
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([lesson.id]);
  });
});

describe('the summary sentences', () => {
  const base = { lessonId: 'l', lessonTitle: 't', language: 'de', next: null };

  it.each([
    [{ checked: 10, correct: 9 }, 'You got 9 of 10 checked exercises right.'],
    [{ checked: 1, correct: 1 }, 'The one checked exercise was right.'],
    [{ checked: 1, correct: 0 }, 'The one checked exercise was not right.'],
    [{ checked: 0, correct: 0 }, 'This lesson had no exercises that are checked yet.'],
  ])('says the score of %o', (numbers, sentence) => {
    expect(scoreSentence({ ...base, ...numbers, selfChecked: 0, newReviewItems: 0 })).toBe(
      sentence,
    );
  });

  it('names self checks and new review items in plain words', () => {
    expect(selfCheckSentence(0)).toBeNull();
    expect(selfCheckSentence(2)).toMatch(/^2 tasks were saved as a self check\./);
    expect(selfCheckSentence(1)).toMatch(/do not count towards your level yet/);
    expect(reviewSentence(0)).toBe('This lesson added no new words to your reviews.');
    expect(reviewSentence(1)).toBe('1 new word went into your reviews.');
    expect(reviewSentence(12)).toBe('12 new words and phrases went into your reviews.');
  });
});
