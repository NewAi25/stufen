// match_pairs: join each left text with its right text.
// Score is the share of pairs joined correctly. Correct when all are.

import type { ExerciseTypeDefinition, GradeResult, JSONSchema } from '@stufen/contracts';
import { InvalidResponseError } from '../errors';
import { checkMatchPairsResponse } from '../responses';
import { assertPayload, buildFeedback, clampScore } from '../text';

export interface MatchPair {
  left: string;
  right: string;
}

export interface MatchPairsPayload {
  pairs: MatchPair[];
}

export const matchPairsPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['pairs'],
  additionalProperties: false,
  properties: {
    pairs: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        required: ['left', 'right'],
        additionalProperties: false,
        properties: {
          left: { type: 'string', minLength: 1 },
          right: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseMatchPairsPayload(payload: unknown): MatchPairsPayload {
  assertPayload('match_pairs', matchPairsPayloadSchema, payload);
  return payload as MatchPairsPayload;
}

export function gradeMatchPairs(payload: unknown, response: unknown): GradeResult {
  const typed = parseMatchPairsPayload(payload);
  const checked = checkMatchPairsResponse(response);
  if (!checked.ok) throw checked.error;
  if (checked.value.pairs.length > typed.pairs.length) {
    throw new InvalidResponseError('match_pairs', [
      `pairs must have at most ${typed.pairs.length} entries in this exercise`,
    ]);
  }

  // Each submitted pair can satisfy one expected pair only.
  const submitted = [...checked.value.pairs];
  const missed: MatchPair[] = [];
  for (const pair of typed.pairs) {
    const at = submitted.findIndex(
      (candidate) => candidate.left === pair.left && candidate.right === pair.right,
    );
    if (at === -1) missed.push(pair);
    else submitted.splice(at, 1);
  }

  const correct = missed.length === 0;
  const lead = missed.length === typed.pairs.length ? 'Not quite.' : 'Partly correct.';
  const lines = missed.map((pair) => `"${pair.left}" goes with "${pair.right}".`);
  return {
    correct,
    score: clampScore((typed.pairs.length - missed.length) / typed.pairs.length),
    feedback: correct
      ? buildFeedback('Correct.')
      : buildFeedback(`${lead} ${lines.join(' ')}`, {
          expected: missed.map((pair) => `${pair.left} = ${pair.right}`).join('; '),
        }),
  };
}

export const matchPairsType: ExerciseTypeDefinition = {
  id: 'match_pairs',
  skill: ['vocabulary'],
  payloadSchema: matchPairsPayloadSchema,
  needsAi: false,
  rendererKey: 'match_pairs',
  grade: async (payload, response) => gradeMatchPairs(payload, response),
};
