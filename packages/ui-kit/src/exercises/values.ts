// emptyValue and isComplete: what the host needs to hold a response in state
// and to know when the Check button may be enabled. Neither grades.

import { CLOZE_GAP, isPayloadOf, isRecord, isRenderableType, isStringList } from './guards';
import { FLASHCARD_RATINGS } from './types';
import type {
  ExercisePayloadMap,
  ExerciseValue,
  ExerciseValueMap,
  RenderableExerciseType,
} from './types';

/** How many gaps a cloze text has. */
export function countGaps(text: string): number {
  return text.split(CLOZE_GAP).length - 1;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

type EmptyValues = {
  [T in RenderableExerciseType]: (payload: ExercisePayloadMap[T]) => ExerciseValueMap[T] | null;
};

const EMPTY: EmptyValues = {
  multiple_choice: () => null,
  cloze: (payload) => ({ answers: Array.from({ length: countGaps(payload.text) }, () => '') }),
  match_pairs: () => ({ pairs: [] }),
  order_words: () => ({ order: [] }),
  flashcard: () => null,
  read_answer: (payload) => ({ answers: payload.questions.map(() => '') }),
  listen_answer: (payload) => ({ answers: payload.questions.map(() => '') }),
  dictation: () => ({ text: '' }),
};

function emptyOf<T extends RenderableExerciseType>(
  type: T,
  payload: unknown,
): ExerciseValueMap[T] | null {
  return isPayloadOf(type, payload) ? EMPTY[type](payload) : null;
}

/**
 * The value to start an exercise with. `null` for the types where nothing
 * can be half answered (multiple_choice, flashcard), for a type the kit has
 * no renderer for, and for a payload that does not fit its type.
 */
export function emptyValue(type: string, payload: unknown): ExerciseValue | null {
  return isRenderableType(type) ? emptyOf(type, payload) : null;
}

type CompleteChecks = {
  [T in RenderableExerciseType]: (
    payload: ExercisePayloadMap[T],
    value: Record<string, unknown>,
  ) => boolean;
};

function questionsAnswered(count: number, value: Record<string, unknown>): boolean {
  const answers = value.answers;
  return (
    Array.isArray(answers) &&
    answers.length === count &&
    answers.every((answer) => isIndex(answer) || filled(answer))
  );
}

const COMPLETE: CompleteChecks = {
  multiple_choice: (payload, value) =>
    isIndex(value.selected) && value.selected < payload.options.length,
  cloze: (payload, value) =>
    isStringList(value.answers) &&
    value.answers.length === countGaps(payload.text) &&
    value.answers.every(filled),
  match_pairs: (payload, value) =>
    Array.isArray(value.pairs) && value.pairs.length === payload.pairs.length,
  order_words: (payload, value) =>
    isStringList(value.order) && value.order.length === payload.words.length,
  flashcard: (_payload, value) => FLASHCARD_RATINGS.some((rating) => rating === value.rating),
  read_answer: (payload, value) => questionsAnswered(payload.questions.length, value),
  listen_answer: (payload, value) => questionsAnswered(payload.questions.length, value),
  dictation: (_payload, value) => filled(value.text),
};

function completeOf<T extends RenderableExerciseType>(
  type: T,
  payload: unknown,
  value: Record<string, unknown>,
): boolean {
  return isPayloadOf(type, payload) && COMPLETE[type](payload, value);
}

/** True when the response is whole, so the host may enable the Check button. */
export function isComplete(type: string, payload: unknown, value: unknown): boolean {
  if (!isRenderableType(type) || !isRecord(value)) return false;
  return completeOf(type, payload, value);
}

/** Trims, collapses white space and folds case, like the graders do without a language pack. */
export function looseForm(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** True when the text matches one of the accepted forms, compared loosely. */
export function looseMatch(text: string, accepted: readonly string[]): boolean {
  const given = looseForm(text);
  return accepted.some((candidate) => looseForm(candidate) === given);
}
