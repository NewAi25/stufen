// order_words: put the shuffled tokens into a sentence.
// Correct only when the submitted order equals an accepted order, after
// normalising spaces. Score is the share of words in the right position,
// measured against the closest accepted order.

import type { ExerciseTypeDefinition, GradeResult, JSONSchema } from '@stufen/contracts';
import { InvalidPayloadError } from '../errors';
import { checkOrderWordsResponse } from '../responses';
import { assertPayload, buildFeedback, clampScore, collapseSpaces } from '../text';

export interface OrderWordsPayload {
  words: string[];
  answer: string;
  accept?: string[];
}

export const orderWordsPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['words', 'answer'],
  additionalProperties: false,
  properties: {
    words: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
    answer: { type: 'string', minLength: 1 },
    accept: { type: 'array', items: { type: 'string' } },
  },
};

function splitWords(text: string): string[] {
  const collapsed = collapseSpaces(text);
  return collapsed === '' ? [] : collapsed.split(' ');
}

function sameWords(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((word, index) => word === right[index]);
}

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseOrderWordsPayload(payload: unknown): OrderWordsPayload {
  assertPayload('order_words', orderWordsPayloadSchema, payload);
  const typed = payload as OrderWordsPayload;
  const bank = splitWords(typed.words.join(' '));
  const problems: string[] = [];
  if (!sameWords(bank, splitWords(typed.answer))) {
    problems.push('payload.answer must use exactly the tokens in payload.words');
  }
  (typed.accept ?? []).forEach((order, index) => {
    if (!sameWords(bank, splitWords(order))) {
      problems.push(`payload.accept[${index}] must use exactly the tokens in payload.words`);
    }
  });
  if (problems.length > 0) throw new InvalidPayloadError('order_words', problems);
  return typed;
}

/** Share of positions where the submitted word equals the target word. */
function positionScore(submitted: string[], target: string[]): number {
  const length = Math.max(submitted.length, target.length);
  if (length === 0) return 0;
  const hits = target.filter((word, index) => submitted[index] === word).length;
  return hits / length;
}

export function gradeOrderWords(payload: unknown, response: unknown): GradeResult {
  const typed = parseOrderWordsPayload(payload);
  const checked = checkOrderWordsResponse(response);
  if (!checked.ok) throw checked.error;

  const submitted = splitWords(checked.value.order.join(' '));
  const accepted = [typed.answer, ...(typed.accept ?? [])].map(collapseSpaces);
  if (accepted.includes(submitted.join(' '))) {
    return { correct: true, score: 1, feedback: buildFeedback('Correct.') };
  }

  // Show and score against the accepted order closest to what was submitted.
  let closest = accepted[0] ?? '';
  let score = 0;
  for (const order of accepted) {
    const candidate = positionScore(submitted, splitWords(order));
    if (candidate > score) {
      score = candidate;
      closest = order;
    }
  }

  const lead = score > 0 ? 'Partly correct.' : 'Not quite.';
  return {
    correct: false,
    score: clampScore(score),
    feedback: buildFeedback(`${lead} The sentence is: ${closest}`, { expected: closest }),
    errorTypes: ['word_order'],
  };
}

export const orderWordsType: ExerciseTypeDefinition = {
  id: 'order_words',
  skill: ['grammar'],
  payloadSchema: orderWordsPayloadSchema,
  needsAi: false,
  rendererKey: 'order_words',
  grade: async (payload, response) => gradeOrderWords(payload, response),
};
