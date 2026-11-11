// cloze: a text with one ___ per blank. Each blank is compared on its own,
// after the language pack's normalize, against its answer and its accept list.
// Score is the share of blanks that are right. Correct when all are.

import type {
  ErrorType,
  ExerciseTypeDefinition,
  GradeContext,
  GradeResult,
  JSONSchema,
} from '@stufen/contracts';
import { InvalidPayloadError, InvalidResponseError } from '../errors';
import { checkClozeResponse } from '../responses';
import { assertPayload, buildFeedback, clampScore, classify, normalizeText, unique } from '../text';

export interface ClozeBlank {
  answer: string;
  accept?: string[];
  hint?: string;
}

export interface ClozePayload {
  text: string;
  blanks: ClozeBlank[];
  explanation_en?: string;
}

const GAP = '___';

export const clozePayloadSchema: JSONSchema = {
  type: 'object',
  required: ['text', 'blanks'],
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1 },
    blanks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['answer'],
        additionalProperties: false,
        properties: {
          answer: { type: 'string', minLength: 1 },
          accept: { type: 'array', items: { type: 'string' } },
          hint: { type: 'string' },
        },
      },
    },
    explanation_en: { type: 'string' },
  },
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseClozePayload(payload: unknown): ClozePayload {
  assertPayload('cloze', clozePayloadSchema, payload);
  const typed = payload as ClozePayload;
  const gaps = typed.text.split(GAP).length - 1;
  if (gaps !== typed.blanks.length) {
    throw new InvalidPayloadError('cloze', [
      `payload.text has ${gaps} gaps but payload.blanks has ${typed.blanks.length} entries`,
    ]);
  }
  return typed;
}

/** The text with every gap filled by its main answer. */
function solvedText(payload: ClozePayload): string {
  const parts = payload.text.split(GAP);
  return parts.map((part, index) => part + (payload.blanks[index]?.answer ?? '')).join('');
}

function blankIsRight(blank: ClozeBlank, actual: string, ctx: GradeContext | undefined): boolean {
  const given = normalizeText(actual, ctx);
  const accepted = [blank.answer, ...(blank.accept ?? [])];
  return accepted.some((candidate) => normalizeText(candidate, ctx) === given);
}

function clozeMessage(payload: ClozePayload, wrong: number[]): string {
  if (wrong.length === 0) return 'Correct.';
  const lead = wrong.length === payload.blanks.length ? 'Not quite.' : 'Partly correct.';
  if (payload.blanks.length === 1) {
    return `${lead} The answer is "${payload.blanks[0]?.answer ?? ''}".`;
  }
  const lines = wrong.map(
    (index) => `Blank ${index + 1} is "${payload.blanks[index]?.answer ?? ''}".`,
  );
  return `${lead} ${lines.join(' ')}`;
}

export function gradeCloze(
  payload: unknown,
  response: unknown,
  ctx: GradeContext | undefined,
): GradeResult {
  const typed = parseClozePayload(payload);
  const checked = checkClozeResponse(response);
  if (!checked.ok) throw checked.error;
  const answers = checked.value.answers;
  if (answers.length !== typed.blanks.length) {
    throw new InvalidResponseError('cloze', [
      `answers must have one entry per blank, ${typed.blanks.length} in this exercise`,
    ]);
  }

  const wrong: number[] = [];
  const errorTypes: ErrorType[] = [];
  typed.blanks.forEach((blank, index) => {
    const actual = answers[index] ?? '';
    if (blankIsRight(blank, actual, ctx)) return;
    wrong.push(index);
    // An empty blank has nothing to classify.
    if (actual.trim() !== '') errorTypes.push(...classify(blank.answer, actual, ctx));
  });

  const correct = wrong.length === 0;
  const result: GradeResult = {
    correct,
    score: clampScore((typed.blanks.length - wrong.length) / typed.blanks.length),
    feedback: buildFeedback(clozeMessage(typed, wrong), {
      explanation: typed.explanation_en,
      expected: solvedText(typed),
    }),
  };
  if (errorTypes.length > 0) result.errorTypes = unique(errorTypes);
  return result;
}

export const clozeType: ExerciseTypeDefinition = {
  id: 'cloze',
  skill: ['grammar', 'vocabulary'],
  payloadSchema: clozePayloadSchema,
  needsAi: false,
  rendererKey: 'cloze',
  grade: async (payload, response, ctx) => gradeCloze(payload, response, ctx),
};
