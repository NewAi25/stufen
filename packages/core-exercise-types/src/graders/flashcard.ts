// flashcard: the learner turns the card and rates their own recall.
// Correct unless the rating is again. Score: again 0, hard 0.6, good 0.8, easy 1.

import type { ExerciseTypeDefinition, GradeResult, JSONSchema } from '@stufen/contracts';
import { checkFlashcardResponse } from '../responses';
import type { FlashcardRating } from '../responses';
import { assertPayload, buildFeedback } from '../text';

export interface FlashcardPayload {
  front: string;
  back: string;
  hint?: string;
  audio?: string;
}

export const flashcardPayloadSchema: JSONSchema = {
  type: 'object',
  required: ['front', 'back'],
  additionalProperties: false,
  properties: {
    front: { type: 'string', minLength: 1 },
    back: { type: 'string', minLength: 1 },
    hint: { type: 'string' },
    audio: { type: 'string' },
  },
};

export const FLASHCARD_SCORES: Record<FlashcardRating, number> = {
  again: 0,
  hard: 0.6,
  good: 0.8,
  easy: 1,
};

/** Returns the typed payload or throws InvalidPayloadError. */
export function parseFlashcardPayload(payload: unknown): FlashcardPayload {
  assertPayload('flashcard', flashcardPayloadSchema, payload);
  return payload as FlashcardPayload;
}

export function gradeFlashcard(payload: unknown, response: unknown): GradeResult {
  const typed = parseFlashcardPayload(payload);
  const checked = checkFlashcardResponse(response);
  if (!checked.ok) throw checked.error;

  const rating = checked.value.rating;
  const message =
    rating === 'again' ? `The answer is "${typed.back}".` : `Rated ${rating}. "${typed.back}".`;
  return {
    correct: rating !== 'again',
    score: FLASHCARD_SCORES[rating],
    feedback: buildFeedback(message, { expected: typed.back }),
  };
}

export const flashcardType: ExerciseTypeDefinition = {
  id: 'flashcard',
  skill: ['vocabulary'],
  payloadSchema: flashcardPayloadSchema,
  needsAi: false,
  rendererKey: 'flashcard',
  grade: async (payload, response) => gradeFlashcard(payload, response),
};
