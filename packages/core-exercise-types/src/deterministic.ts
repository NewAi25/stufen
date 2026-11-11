// The eight exercise types that are graded without AI.
// translate, write_free and speak_prompt are registered by a later change.

import type { ExerciseTypeDefinition } from '@stufen/contracts';
import { clozeType } from './graders/cloze';
import { dictationType } from './graders/dictation';
import { flashcardType } from './graders/flashcard';
import { listenAnswerType } from './graders/listen-answer';
import { matchPairsType } from './graders/match-pairs';
import { multipleChoiceType } from './graders/multiple-choice';
import { orderWordsType } from './graders/order-words';
import { readAnswerType } from './graders/read-answer';
import type { ExerciseTypeRegistry } from './registry';

export const DETERMINISTIC_TYPES: readonly ExerciseTypeDefinition[] = [
  multipleChoiceType,
  clozeType,
  matchPairsType,
  orderWordsType,
  flashcardType,
  readAnswerType,
  listenAnswerType,
  dictationType,
];

/** Registers the eight deterministic types. Throws if one is already there. */
export function registerDeterministicTypes(registry: ExerciseTypeRegistry): void {
  for (const def of DETERMINISTIC_TYPES) registry.registerType(def);
}
