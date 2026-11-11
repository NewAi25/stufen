// Test data for the lesson engine: one small lesson of four exercises and a
// fake grader. Ids are uuids so the same fixture works on the Postgres store.
import { randomUUID } from 'node:crypto';
import type {
  Exercise,
  ExerciseTypeId,
  GradeResult,
  LanguageCode,
  Lesson,
} from '@stufen/contracts';

export const PACK_VERSION = '0.0.0-test';

const TYPES: ExerciseTypeId[] = ['multiple_choice', 'cloze', 'order_words', 'dictation'];

export interface LessonFixtureOptions {
  lessonId?: string;
  unitId?: string;
  /** Four ids, in ordinal order. */
  exerciseIds?: string[];
  /** Per exercise, by position. Default: none. */
  candoIds?: string[][];
  itemIds?: string[][];
}

/** A lesson with four exercises, ordinals 1 to 4, in ordinal order. */
export function makeLesson(options: LessonFixtureOptions = {}): Lesson {
  const lessonId = options.lessonId ?? randomUUID();
  const exercises: Exercise[] = TYPES.map((type, index) => ({
    id: options.exerciseIds?.[index] ?? randomUUID(),
    lessonId,
    ordinal: index + 1,
    type,
    skill: 'vocabulary',
    payload: { prompt: `Question ${index + 1}` },
    candoIds: options.candoIds?.[index] ?? [],
    itemIds: options.itemIds?.[index] ?? [],
    packVersion: PACK_VERSION,
  }));
  return {
    id: lessonId,
    unitId: options.unitId ?? randomUUID(),
    ordinal: 1,
    slug: `test-lesson-${lessonId}`,
    title: 'Test lesson',
    kind: 'core',
    estimatedMinutes: 5,
    candoIds: [],
    packVersion: PACK_VERSION,
    exercises,
  };
}

/** Responses the fake grader understands. Anything else is graded as wrong. */
export const RIGHT = { answer: 'right' };
export const HALF = { answer: 'half' };
export const WRONG = { answer: 'wrong' };
export const BOOM = { answer: 'boom' };

export class FakeGraderError extends Error {
  constructor() {
    super('the fake grader was told to fail');
    this.name = 'FakeGraderError';
  }
}

export interface GradeCall {
  exerciseId: string;
  response: unknown;
  language: LanguageCode;
}

function answerOf(response: unknown): unknown {
  if (typeof response !== 'object' || response === null || !('answer' in response)) return null;
  return response.answer;
}

/** A grader that needs no registry. `calls` records every call in order. */
export function createFakeGrader(): {
  grade: (exercise: Exercise, response: unknown, language: LanguageCode) => Promise<GradeResult>;
  calls: GradeCall[];
} {
  const calls: GradeCall[] = [];
  return {
    calls,
    async grade(exercise, response, language) {
      calls.push({ exerciseId: exercise.id, response, language });
      const answer = answerOf(response);
      if (answer === 'boom') throw new FakeGraderError();
      if (answer === 'right') {
        return { correct: true, score: 1, feedback: { message: 'Correct.' } };
      }
      if (answer === 'half') {
        return {
          correct: false,
          score: 0.5,
          feedback: { message: 'Nearly.', expected: 'right' },
          errorTypes: ['spelling'],
        };
      }
      return { correct: false, score: 0, feedback: { message: 'Not quite.', expected: 'right' } };
    },
  };
}
