// Text helpers shared by the graders.

import type {
  ErrorType,
  ExerciseTypeId,
  Feedback,
  GradeContext,
  JSONSchema,
} from '@stufen/contracts';
import { InvalidPayloadError } from './errors';
import { checkSchema } from './schema';

/** Collapses every run of white space to one space and trims the ends. */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Lenient form of a text for comparing. Uses the language pack's normalize
 * when the context carries language rules. Otherwise trims and case folds.
 */
export function normalizeText(text: string, ctx: GradeContext | undefined): string {
  const normalize = ctx?.languageRules?.normalize;
  if (typeof normalize === 'function') {
    return collapseSpaces(normalize.call(ctx?.languageRules, text));
  }
  return collapseSpaces(text.normalize('NFC')).toLowerCase();
}

/** Error categories from the language pack, or none when no rules are wired. */
export function classify(
  expected: string,
  actual: string,
  ctx: GradeContext | undefined,
): ErrorType[] {
  const classifyError = ctx?.languageRules?.classifyError;
  if (typeof classifyError !== 'function') return [];
  return classifyError.call(ctx?.languageRules, expected, actual);
}

/** Keeps the first occurrence of each value, in order. */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Rounds a score to four decimals and keeps it between 0 and 1. */
export function clampScore(score: number): number {
  return Math.min(1, Math.max(0, Math.round(score * 10000) / 10000));
}

/** Builds a Feedback without ever setting an optional field to undefined. */
export function buildFeedback(
  message: string,
  extra: { explanation?: string | undefined; expected?: string | undefined } = {},
): Feedback {
  const feedback: Feedback = { message };
  if (extra.explanation) feedback.explanation = extra.explanation;
  if (extra.expected) feedback.expected = extra.expected;
  return feedback;
}

/** Throws InvalidPayloadError when the payload does not fit the schema. */
export function assertPayload(
  exerciseType: ExerciseTypeId,
  schema: JSONSchema,
  payload: unknown,
): void {
  const problems = checkSchema(schema, payload);
  if (problems.length > 0) throw new InvalidPayloadError(exerciseType, problems);
}
