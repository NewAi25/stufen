// multiple_choice: one question, two or more options, one correct option.
// Correct when the chosen option set equals the correct set. Score 1 or 0.

import { SKILLS } from '@stufen/contracts';
import type { ExerciseTypeDefinition, GradeResult, JSONSchema } from '@stufen/contracts';
import { InvalidPayloadError, InvalidResponseError } from '../errors';
import { checkMultipleChoiceResponse } from '../responses';
import { assertPayload, buildFeedback, unique } from '../text';

export interface MultipleChoicePayload {
  question: string;
  options: string[];
  answer_index: number;
  explanation_en?: string;
  audio?: string;
}

export const multipleChoicePayloadSchema: JSONSchema = {
  type: 'object',
  required: ['question', 'options', 'answer_index'],
  additionalProperties: false,
  properties: {
    question: { type: 'string', minLength: 1 },
    options: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
    answer_index: { type: 'integer', minimum: 0 },
    explanation_en: { type: 'string' },
    audio: { type: 'string' },
  },
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseMultipleChoicePayload(payload: unknown): MultipleChoicePayload {
  assertPayload('multiple_choice', multipleChoicePayloadSchema, payload);
  const typed = payload as MultipleChoicePayload;
  if (typed.answer_index >= typed.options.length) {
    throw new InvalidPayloadError('multiple_choice', [
      'payload.answer_index must point at one of the options',
    ]);
  }
  return typed;
}

export function gradeMultipleChoice(payload: unknown, response: unknown): GradeResult {
  const typed = parseMultipleChoicePayload(payload);
  const checked = checkMultipleChoiceResponse(response);
  if (!checked.ok) throw checked.error;

  const selected = checked.value.selected;
  const chosen = unique(typeof selected === 'number' ? [selected] : selected);
  if (chosen.some((index) => index >= typed.options.length)) {
    throw new InvalidResponseError('multiple_choice', [
      'selected must point at one of the options',
    ]);
  }

  const correct = chosen.length === 1 && chosen[0] === typed.answer_index;
  const expected = typed.options[typed.answer_index] ?? '';
  const message = correct ? 'Correct.' : `Not quite. The answer is "${expected}".`;
  return {
    correct,
    score: correct ? 1 : 0,
    feedback: buildFeedback(message, { explanation: typed.explanation_en, expected }),
  };
}

export const multipleChoiceType: ExerciseTypeDefinition = {
  id: 'multiple_choice',
  skill: [...SKILLS],
  payloadSchema: multipleChoicePayloadSchema,
  needsAi: false,
  rendererKey: 'multiple_choice',
  grade: async (payload, response) => gradeMultipleChoice(payload, response),
};
