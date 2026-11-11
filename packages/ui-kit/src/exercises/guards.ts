// Runtime checks for payloads that arrive as JSON. A check never throws.
// Internal to the kit, apart from isRenderableType.

import { FLASHCARD_RATINGS, RENDERABLE_TYPES } from './types';
import type {
  ClozePayload,
  DictationPayload,
  ExercisePayloadMap,
  ExerciseValueMap,
  FlashcardPayload,
  ListenAnswerPayload,
  MatchPairsPayload,
  MultipleChoicePayload,
  OrderWordsPayload,
  QuestionPayload,
  ReadAnswerPayload,
  RenderableExerciseType,
} from './types';

/** The gap marker of a cloze text: three underscores. */
export const CLOZE_GAP = '___';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isRenderableType(type: unknown): type is RenderableExerciseType {
  return RENDERABLE_TYPES.some((candidate) => candidate === type);
}

function isMultipleChoice(payload: unknown): payload is MultipleChoicePayload {
  return isRecord(payload) && typeof payload.question === 'string' && isStringList(payload.options);
}

function isCloze(payload: unknown): payload is ClozePayload {
  return (
    isRecord(payload) &&
    typeof payload.text === 'string' &&
    Array.isArray(payload.blanks) &&
    payload.blanks.every(isRecord)
  );
}

function isMatchPairs(payload: unknown): payload is MatchPairsPayload {
  return (
    isRecord(payload) &&
    Array.isArray(payload.pairs) &&
    payload.pairs.every(
      (pair) => isRecord(pair) && typeof pair.left === 'string' && typeof pair.right === 'string',
    )
  );
}

function isOrderWords(payload: unknown): payload is OrderWordsPayload {
  return isRecord(payload) && isStringList(payload.words);
}

function isFlashcard(payload: unknown): payload is FlashcardPayload {
  return isRecord(payload) && typeof payload.front === 'string' && typeof payload.back === 'string';
}

function isQuestion(question: unknown): question is QuestionPayload {
  return (
    isRecord(question) &&
    typeof question.question === 'string' &&
    (question.options === undefined || isStringList(question.options))
  );
}

function isQuestionList(questions: unknown): questions is QuestionPayload[] {
  return Array.isArray(questions) && questions.every(isQuestion);
}

function isReadAnswer(payload: unknown): payload is ReadAnswerPayload {
  return isRecord(payload) && typeof payload.text === 'string' && isQuestionList(payload.questions);
}

function isListenAnswer(payload: unknown): payload is ListenAnswerPayload {
  return (
    isRecord(payload) && typeof payload.transcript === 'string' && isQuestionList(payload.questions)
  );
}

function isDictation(payload: unknown): payload is DictationPayload {
  return isRecord(payload) && typeof payload.text === 'string';
}

const PAYLOAD_GUARDS: {
  [T in RenderableExerciseType]: (payload: unknown) => payload is ExercisePayloadMap[T];
} = {
  multiple_choice: isMultipleChoice,
  cloze: isCloze,
  match_pairs: isMatchPairs,
  order_words: isOrderWords,
  flashcard: isFlashcard,
  read_answer: isReadAnswer,
  listen_answer: isListenAnswer,
  dictation: isDictation,
};

/** True when the payload has the fields the renderer of that type reads. */
export function isPayloadOf<T extends RenderableExerciseType>(
  type: T,
  payload: unknown,
): payload is ExercisePayloadMap[T] {
  return PAYLOAD_GUARDS[type](payload);
}

// ---------- values ----------

function isAnswerList(value: unknown): value is (number | string)[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' || typeof entry === 'number')
  );
}

function isPairList(value: unknown): value is { left: string; right: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (pair) => isRecord(pair) && typeof pair.left === 'string' && typeof pair.right === 'string',
    )
  );
}

const VALUE_GUARDS: { [T in RenderableExerciseType]: (value: Record<string, unknown>) => boolean } =
  {
    multiple_choice: (value) => typeof value.selected === 'number',
    cloze: (value) => isStringList(value.answers),
    match_pairs: (value) => isPairList(value.pairs),
    order_words: (value) => isStringList(value.order),
    flashcard: (value) => FLASHCARD_RATINGS.some((rating) => rating === value.rating),
    read_answer: (value) => isAnswerList(value.answers),
    listen_answer: (value) => isAnswerList(value.answers),
    dictation: (value) => typeof value.text === 'string',
  };

/** The value as the response of that type, or null when it is not one. */
export function valueOf<T extends RenderableExerciseType>(
  type: T,
  value: unknown,
): ExerciseValueMap[T] | null {
  if (!isRecord(value) || !VALUE_GUARDS[type](value)) return null;
  return value as unknown as ExerciseValueMap[T];
}
