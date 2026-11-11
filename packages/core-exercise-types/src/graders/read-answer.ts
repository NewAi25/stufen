// read_answer: a short text and one or more questions about it.
// Each question is graded on its own. See questions.ts for the rule.

import type {
  ExerciseTypeDefinition,
  GradeContext,
  GradeResult,
  JSONSchema,
} from '@stufen/contracts';
import { checkReadAnswerResponse } from '../responses';
import { assertPayload } from '../text';
import { assertQuestionIndexes, gradeQuestions, questionsSchema } from './questions';
import type { Question } from './questions';

export interface ReadAnswerPayload {
  text: string;
  title?: string;
  questions: Question[];
}

export const readAnswerPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['text', 'questions'],
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    questions: questionsSchema,
  },
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseReadAnswerPayload(payload: unknown): ReadAnswerPayload {
  assertPayload('read_answer', readAnswerPayloadSchema, payload);
  const typed = payload as ReadAnswerPayload;
  assertQuestionIndexes('read_answer', typed.questions);
  return typed;
}

export function gradeReadAnswer(
  payload: unknown,
  response: unknown,
  ctx: GradeContext | undefined,
): GradeResult {
  const typed = parseReadAnswerPayload(payload);
  const checked = checkReadAnswerResponse(response);
  if (!checked.ok) throw checked.error;
  return gradeQuestions('read_answer', typed.questions, checked.value, ctx);
}

export const readAnswerType: ExerciseTypeDefinition = {
  id: 'read_answer',
  skill: ['reading'],
  payloadSchema: readAnswerPayloadSchema,
  needsAi: false,
  rendererKey: 'read_answer',
  grade: async (payload, response, ctx) => gradeReadAnswer(payload, response, ctx),
};
