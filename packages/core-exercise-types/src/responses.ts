// What the learner submits, per exercise type, and a runtime guard for each.
// A guard never throws. It returns the typed response, or an InvalidResponseError
// that says what is wrong. Extra fields on a response are ignored.

import type { ExerciseTypeId } from '@stufen/contracts';
import { InvalidResponseError } from './errors';
import { isRecord } from './schema';

export type ResponseCheck<T> = { ok: true; value: T } | { ok: false; error: InvalidResponseError };

/** The chosen option index, or a list of indexes. Zero based. */
export interface MultipleChoiceResponse {
  selected: number | number[];
}

/** One typed answer per blank, in the order of the blanks. */
export interface ClozeResponse {
  answers: string[];
}

/** The pairs the learner joined. Each left text with the right text chosen for it. */
export interface MatchPairsResponse {
  pairs: { left: string; right: string }[];
}

/** The word bank tokens in the order the learner placed them. */
export interface OrderWordsResponse {
  order: string[];
}

export const FLASHCARD_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type FlashcardRating = (typeof FLASHCARD_RATINGS)[number];

/** The learner's own rating after seeing the back of the card. */
export interface FlashcardResponse {
  rating: FlashcardRating;
}

/** One answer per question: an option index, or typed text for a short answer. */
export interface QuestionsResponse {
  answers: (number | string)[];
}
export type ReadAnswerResponse = QuestionsResponse;
export type ListenAnswerResponse = QuestionsResponse;

/** The typed transcription. `replays` is how often the audio was replayed. */
export interface DictationResponse {
  text: string;
  replays?: number;
}

function fail<T>(exerciseType: ExerciseTypeId, problem: string): ResponseCheck<T> {
  return { ok: false, error: new InvalidResponseError(exerciseType, [problem]) };
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function checkMultipleChoiceResponse(
  response: unknown,
): ResponseCheck<MultipleChoiceResponse> {
  if (!isRecord(response)) return fail('multiple_choice', 'response must be an object');
  const selected = response.selected;
  if (isIndex(selected)) return { ok: true, value: { selected } };
  if (Array.isArray(selected) && selected.length > 0 && selected.every(isIndex)) {
    return { ok: true, value: { selected: [...selected] } };
  }
  return fail('multiple_choice', 'selected must be an option index or a list of option indexes');
}

export function checkClozeResponse(response: unknown): ResponseCheck<ClozeResponse> {
  if (!isRecord(response)) return fail('cloze', 'response must be an object');
  const answers = response.answers;
  if (!isStringList(answers)) return fail('cloze', 'answers must be a list of strings');
  return { ok: true, value: { answers: [...answers] } };
}

export function checkMatchPairsResponse(response: unknown): ResponseCheck<MatchPairsResponse> {
  if (!isRecord(response)) return fail('match_pairs', 'response must be an object');
  const pairs = response.pairs;
  if (!Array.isArray(pairs)) return fail('match_pairs', 'pairs must be a list');
  const value: MatchPairsResponse = { pairs: [] };
  for (const pair of pairs) {
    if (!isRecord(pair) || typeof pair.left !== 'string' || typeof pair.right !== 'string') {
      return fail('match_pairs', 'every pair needs a left and a right text');
    }
    value.pairs.push({ left: pair.left, right: pair.right });
  }
  return { ok: true, value };
}

export function checkOrderWordsResponse(response: unknown): ResponseCheck<OrderWordsResponse> {
  if (!isRecord(response)) return fail('order_words', 'response must be an object');
  const order = response.order;
  if (!isStringList(order)) return fail('order_words', 'order must be a list of strings');
  return { ok: true, value: { order: [...order] } };
}

export function checkFlashcardResponse(response: unknown): ResponseCheck<FlashcardResponse> {
  if (!isRecord(response)) return fail('flashcard', 'response must be an object');
  const rating = FLASHCARD_RATINGS.find((candidate) => candidate === response.rating);
  if (!rating) return fail('flashcard', 'rating must be again, hard, good or easy');
  return { ok: true, value: { rating } };
}

function checkQuestionsResponse(
  exerciseType: 'read_answer' | 'listen_answer',
  response: unknown,
): ResponseCheck<QuestionsResponse> {
  if (!isRecord(response)) return fail(exerciseType, 'response must be an object');
  const answers = response.answers;
  if (!Array.isArray(answers)) return fail(exerciseType, 'answers must be a list');
  const value: QuestionsResponse = { answers: [] };
  for (const answer of answers) {
    if (!isIndex(answer) && typeof answer !== 'string') {
      return fail(exerciseType, 'every answer must be an option index or a text');
    }
    value.answers.push(answer);
  }
  return { ok: true, value };
}

export function checkReadAnswerResponse(response: unknown): ResponseCheck<ReadAnswerResponse> {
  return checkQuestionsResponse('read_answer', response);
}

export function checkListenAnswerResponse(response: unknown): ResponseCheck<ListenAnswerResponse> {
  return checkQuestionsResponse('listen_answer', response);
}

export function checkDictationResponse(response: unknown): ResponseCheck<DictationResponse> {
  if (!isRecord(response)) return fail('dictation', 'response must be an object');
  if (typeof response.text !== 'string') return fail('dictation', 'text must be a string');
  const value: DictationResponse = { text: response.text };
  if (response.replays !== undefined) {
    if (!isIndex(response.replays)) return fail('dictation', 'replays must be a whole number');
    value.replays = response.replays;
  }
  return { ok: true, value };
}
