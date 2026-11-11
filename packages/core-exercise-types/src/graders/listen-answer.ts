// listen_answer: a spoken text and one or more questions about it.
// Each question is graded on its own. See questions.ts for the rule.

import type {
  ExerciseTypeDefinition,
  GradeContext,
  GradeResult,
  JSONSchema,
} from '@stufen/contracts';
import { checkListenAnswerResponse } from '../responses';
import { assertPayload } from '../text';
import { assertQuestionIndexes, gradeQuestions, questionsSchema } from './questions';
import type { Question } from './questions';

export interface ListenAnswerPayload {
  transcript: string;
  audio?: string;
  questions: Question[];
}

export const listenAnswerPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['transcript', 'questions'],
  additionalProperties: false,
  properties: {
    transcript: { type: 'string', minLength: 1 },
    audio: { type: 'string' },
    questions: questionsSchema,
  },
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseListenAnswerPayload(payload: unknown): ListenAnswerPayload {
  assertPayload('listen_answer', listenAnswerPayloadSchema, payload);
  const typed = payload as ListenAnswerPayload;
  assertQuestionIndexes('listen_answer', typed.questions);
  return typed;
}

export function gradeListenAnswer(
  payload: unknown,
  response: unknown,
  ctx: GradeContext | undefined,
): GradeResult {
  const typed = parseListenAnswerPayload(payload);
  const checked = checkListenAnswerResponse(response);
  if (!checked.ok) throw checked.error;
  return gradeQuestions('listen_answer', typed.questions, checked.value, ctx);
}

export const listenAnswerType: ExerciseTypeDefinition = {
  id: 'listen_answer',
  skill: ['listening'],
  payloadSchema: listenAnswerPayloadSchema,
  needsAi: false,
  rendererKey: 'listen_answer',
  grade: async (payload, response, ctx) => gradeListenAnswer(payload, response, ctx),
};
