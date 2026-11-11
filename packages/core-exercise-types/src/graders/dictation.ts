// dictation: the learner types what they hear.
// The typed text and the target are normalised, split into words and compared.
// Score is one minus the word error rate (word level edit distance divided by
// the number of words in the target), never below 0. Correct from 0.9 up.

import type {
  ExerciseTypeDefinition,
  GradeContext,
  GradeResult,
  JSONSchema,
} from '@stufen/contracts';
import { checkDictationResponse } from '../responses';
import { assertPayload, buildFeedback, clampScore, normalizeText } from '../text';

export interface DictationPayload {
  text: string;
  audio?: string;
  accept?: string[];
}

export const dictationPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['text'],
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1 },
    audio: { type: 'string' },
    accept: { type: 'array', items: { type: 'string' } },
  },
};

/** Score at or above this counts as correct. */
export const DICTATION_PASS_SCORE = 0.9;

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseDictationPayload(payload: unknown): DictationPayload {
  assertPayload('dictation', dictationPayloadSchema, payload);
  return payload as DictationPayload;
}

/** Normalised words, with punctuation at the edges of each word removed. */
function toWords(text: string, ctx: GradeContext | undefined): string[] {
  return normalizeText(text, ctx)
    .split(' ')
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word !== '');
}

/** Word level edit distance: the fewest words to add, drop or replace. */
export function wordEditDistance(from: string[], to: string[]): number {
  let previous = to.map((_word, index) => index + 1);
  previous.unshift(0);
  from.forEach((word, row) => {
    const current = [row + 1];
    to.forEach((target, column) => {
      const replace = (previous[column] ?? 0) + (word === target ? 0 : 1);
      const drop = (previous[column + 1] ?? 0) + 1;
      const add = (current[column] ?? 0) + 1;
      current.push(Math.min(replace, drop, add));
    });
    previous = current;
  });
  return previous[to.length] ?? 0;
}

function scoreAgainst(typed: string[], target: string[]): number {
  if (target.length === 0) return typed.length === 0 ? 1 : 0;
  return clampScore(1 - wordEditDistance(typed, target) / target.length);
}

export function gradeDictation(
  payload: unknown,
  response: unknown,
  ctx: GradeContext | undefined,
): GradeResult {
  const typed = parseDictationPayload(payload);
  const checked = checkDictationResponse(response);
  if (!checked.ok) throw checked.error;

  // The best score over the target and every accepted spelling counts.
  const words = toWords(checked.value.text, ctx);
  const targets = [typed.text, ...(typed.accept ?? [])];
  const score = Math.max(...targets.map((target) => scoreAgainst(words, toWords(target, ctx))));
  const correct = score >= DICTATION_PASS_SCORE;

  let message = 'Correct.';
  if (!correct) {
    const lead = score > 0 ? 'Partly correct.' : 'Not quite.';
    message = `${lead} The sentence is: ${typed.text}`;
  } else if (score < 1) {
    message = `Correct, with a small slip. The sentence is: ${typed.text}`;
  }

  const result: GradeResult = {
    correct,
    score,
    feedback: buildFeedback(message, { expected: typed.text }),
  };
  if (!correct) result.errorTypes = ['spelling'];
  return result;
}

export const dictationType: ExerciseTypeDefinition = {
  id: 'dictation',
  skill: ['listening', 'writing'],
  payloadSchema: dictationPayloadSchema,
  needsAi: false,
  rendererKey: 'dictation',
  grade: async (payload, response, ctx) => gradeDictation(payload, response, ctx),
};
