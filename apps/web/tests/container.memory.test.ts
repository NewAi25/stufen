import { describe, expect, it } from 'vitest';
import type { CurriculumSnapshot, EventMap, Exercise } from '@stufen/contracts';
import { answerExercise, finishLesson, startLesson } from '../src/server/actions/lesson-actions';
import { createContainer } from '../src/server/container';
import { isProvisionalFeedback, PROVISIONAL_MESSAGE } from '../src/server/grading';
import { memoryConfig } from './helpers/config';
import { correctResponseFor } from './helpers/correct-response';

const PROVISIONAL_TYPES = ['translate', 'write_free', 'speak_prompt'] as const;

async function setup() {
  const container = createContainer(memoryConfig());
  const report = await container.ready;
  const session = await container.auth.createDevSession('learner@stufen.local');
  return { container, report, userId: session.userId };
}

describe('the container on in memory stores', () => {
  it('runs in memory mode with no database handle', async () => {
    const { container } = await setup();
    expect(container.storeMode).toBe('memory');
    expect(container.db).toBeNull();
    expect(container.consoleMail).not.toBeNull();
    await expect(container.close()).resolves.toBeUndefined();
  });

  it('installs the German pack once when it is built', async () => {
    const { container, report } = await setup();
    expect(report).not.toBeNull();
    expect(report).toMatchObject({ language: 'de', status: 'active' });
    expect(await container.content.activePackVersion('de')).toBe(container.packs.de.version);
    expect(await container.stores.content.listVersions('de')).toHaveLength(1);
    expect(await container.stores.events.count('content.pack_installed')).toBe(1);
  });

  it('lists at least one unit and one lesson for German', async () => {
    const { container, report } = await setup();
    const path = await container.curriculum.lessonPath('de');
    expect(path.length).toBeGreaterThan(0);
    expect(path.length).toBe(report?.lessons);

    const first = path[0];
    if (!first) throw new Error('the lesson path is empty');
    const units = await container.curriculum.listUnits('de', first.level);
    expect(units.length).toBeGreaterThan(0);
    expect((await container.curriculum.listLessons(first.unit.id)).length).toBeGreaterThan(0);

    const found = await container.getLesson(first.lesson.id);
    expect(found?.language).toBe('de');
    expect(found?.lesson.exercises.length).toBeGreaterThan(0);
    expect(await container.getLesson('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('points nextLessonFor at the first lesson for a new learner', async () => {
    const { container, userId } = await setup();
    const path = await container.curriculum.lessonPath('de');
    const next = await container.curriculum.nextLessonFor(userId, 'de');
    expect(next?.id).toBe(path[0]?.lesson.id);
  });
});

describe('the wired grade function', () => {
  it.each(PROVISIONAL_TYPES)('answers %s with a labelled self check', async (type) => {
    const { container } = await setup();
    const exercise: Exercise = {
      id: 'e1',
      lessonId: 'not-a-stored-lesson',
      ordinal: 1,
      type,
      skill: 'writing',
      payload: {},
      candoIds: [],
      itemIds: [],
      packVersion: '0.0.0',
    };
    const result = await container.grade(exercise, { text: 'Ich heiße Anna.' }, 'de');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.feedback.message).toBe(PROVISIONAL_MESSAGE);
    expect(result.feedback.message).toMatch(/reviewed by the tutor in a later version/);
    expect(isProvisionalFeedback(result.feedback)).toBe(true);
  });

  it('refuses a language without a registered pack', async () => {
    const { container } = await setup();
    const path = await container.curriculum.lessonPath('de');
    const lesson = await container.getLesson(path[0]?.lesson.id ?? '');
    const graded = lesson?.lesson.exercises.find((entry) =>
      container.exerciseTypes.hasType(entry.type),
    );
    if (!graded) throw new Error('the first lesson has no deterministic exercise');
    await expect(container.grade(graded, correctResponseFor(graded), 'fr')).rejects.toThrow(
      /No language pack/,
    );
  });
});

describe('a full lesson session through the wired engine', () => {
  it('records every exercise of the first lesson, feeds srs and progress', async () => {
    const { container, userId } = await setup();
    const recorded: EventMap['attempt.recorded'][] = [];
    container.bus.on('attempt.recorded', async (event) => {
      recorded.push(event);
    });

    const first = (await container.curriculum.lessonPath('de'))[0];
    if (!first) throw new Error('the lesson path is empty');
    const found = await container.getLesson(first.lesson.id);
    if (!found) throw new Error('the first lesson is not stored');
    const exercises = found.lesson.exercises;

    const session = await startLesson(container, userId, first.lesson.id);
    expect(session.exerciseOrder).toEqual(exercises.map((exercise) => exercise.id));

    // Every exercise is answered, in order. Nothing is skipped.
    for (const exercise of exercises) {
      const current = await container.lessonEngine.currentExercise(userId, session.id);
      expect(current?.id).toBe(exercise.id);
      const answer = correctResponseFor(exercise);
      const { grade } = await answerExercise(container, userId, session.id, exercise.id, answer);
      expect(grade.correct, `${exercise.type} #${exercise.ordinal}`).toBe(true);
      expect(isProvisionalFeedback(grade.feedback)).toBe(
        !container.exerciseTypes.hasType(exercise.type),
      );
    }
    expect(await container.lessonEngine.currentExercise(userId, session.id)).toBeNull();

    // attempt.recorded fired once per exercise, in order.
    expect(recorded).toHaveLength(exercises.length);
    expect(recorded.map((event) => event.exerciseType)).toEqual(exercises.map((e) => e.type));
    expect(recorded.every((event) => event.userId === userId && event.language === 'de')).toBe(
      true,
    );

    // The stored attempts carry the provisional mark exactly where no grader ran.
    const attempts = await container.stores.sessions.listAttemptsBySession(userId, session.id);
    expect(attempts).toHaveLength(exercises.length);
    for (const attempt of attempts) {
      const exercise = exercises.find((entry) => entry.id === attempt.exerciseId);
      if (!exercise) throw new Error('an attempt points at an unknown exercise');
      expect(isProvisionalFeedback(attempt.feedback)).toBe(
        !container.exerciseTypes.hasType(exercise.type),
      );
    }

    // The lesson page finishes through finishLesson, which introduces the items.
    const result = await finishLesson(container, userId, session.id);
    expect(result.attempts).toBe(exercises.length);
    expect(result.correct).toBe(exercises.length);
    expect(result.introducesItemIds).toEqual(found.lesson.introducesItemIds ?? []);
    expect(await container.lessonEngine.completedLessonIds(userId)).toEqual([first.lesson.id]);

    const itemIds = new Set([
      ...result.introducesItemIds,
      ...exercises.flatMap((exercise) => exercise.itemIds),
    ]);
    expect(itemIds.size).toBeGreaterThan(0);
    for (const itemId of itemIds) {
      const card = await container.stores.cards.getCard(userId, itemId);
      expect(card, `card for item ${itemId}`).not.toBeNull();
      expect(card?.language).toBe('de');
    }

    // Progress recorded evidence for the descriptors the exercises target.
    const mastery = await container.progress.masteryFor(userId, 'de');
    const candoIds = new Set(exercises.flatMap((exercise) => exercise.candoIds));
    expect(mastery.length).toBe(candoIds.size);
    expect(mastery.reduce((sum, row) => sum + row.evidenceCount, 0)).toBe(
      exercises.reduce((sum, exercise) => sum + exercise.candoIds.length, 0),
    );
    expect((await container.progress.streak(userId, 'de')).currentDays).toBe(1);

    // Finishing twice is safe and the next lesson moves on.
    await expect(finishLesson(container, userId, session.id)).resolves.toMatchObject({
      sessionId: session.id,
    });
    const next = await container.curriculum.nextLessonFor(userId, 'de');
    expect(next?.id).not.toBe(first.lesson.id);
  });
});

describe('tasks without a grader, inside a session', () => {
  const ids = {
    cando: '11111111-1111-4111-8111-111111111111',
    item: '22222222-2222-4222-8222-222222222222',
    unit: '33333333-3333-4333-8333-333333333333',
    lesson: '44444444-4444-4444-8444-444444444444',
  };
  const version = '9.9.9-test';

  function exercise(ordinal: number, type: Exercise['type']): Exercise {
    return {
      id: `55555555-5555-4555-8555-00000000000${ordinal}`,
      lessonId: ids.lesson,
      ordinal,
      type,
      skill: 'writing',
      payload: { prompt_en: 'Say hello.' },
      candoIds: [ids.cando],
      itemIds: [ids.item],
      packVersion: version,
    };
  }

  const snapshot: CurriculumSnapshot = {
    language: 'de',
    version,
    candos: [
      {
        id: ids.cando,
        languageCode: 'de',
        level: 'A2',
        skill: 'writing',
        code: 'A2.WRI.99',
        textEn: 'Can write a short greeting.',
        textNative: null,
        source: 'test',
        masteryRule: null,
      },
    ],
    items: [
      {
        id: ids.item,
        languageCode: 'de',
        kind: 'vocab',
        key: 'de:vocab:test-hallo',
        lemma: 'hallo',
        glossEn: 'hello',
        level: 'A2',
        frequencyRank: null,
        payload: {},
        packVersion: version,
      },
    ],
    units: [
      {
        id: ids.unit,
        languageCode: 'de',
        level: 'A2',
        ordinal: 1,
        slug: 'test-unit',
        title: 'Test',
        description: null,
        packVersion: version,
        lessons: [
          {
            id: ids.lesson,
            unitId: ids.unit,
            ordinal: 1,
            slug: 'test-lesson',
            title: 'Test',
            kind: 'production',
            estimatedMinutes: 5,
            candoIds: [ids.cando],
            packVersion: version,
            introducesItemIds: [ids.item],
            exercises: PROVISIONAL_TYPES.map((type, index) => exercise(index + 1, type)),
          },
        ],
      },
    ],
  };

  it('stores each attempt as provisional and still fires attempt.recorded', async () => {
    const { container, userId } = await setup();
    await container.stores.curriculum.replaceLanguage(snapshot);
    let recorded = 0;
    container.bus.on('attempt.recorded', async () => {
      recorded += 1;
    });

    const session = await startLesson(container, userId, ids.lesson);
    for (const entry of snapshot.units[0]?.lessons[0]?.exercises ?? []) {
      const { grade } = await answerExercise(container, userId, session.id, entry.id, {
        text: 'Hallo!',
      });
      expect(grade).toMatchObject({ correct: true, score: 1 });
      expect(grade.feedback.message).toBe(PROVISIONAL_MESSAGE);
    }
    expect(recorded).toBe(PROVISIONAL_TYPES.length);

    const attempts = await container.stores.sessions.listAttemptsBySession(userId, session.id);
    expect(attempts).toHaveLength(PROVISIONAL_TYPES.length);
    for (const attempt of attempts) {
      expect(attempt.feedback).toMatchObject({ provisional: true, message: PROVISIONAL_MESSAGE });
    }

    await finishLesson(container, userId, session.id);
    expect(await container.stores.cards.getCard(userId, ids.item)).not.toBeNull();
  });
});
