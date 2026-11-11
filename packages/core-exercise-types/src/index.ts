// @stufen/core-exercise-types
// Registry of exercise types. Each type has a payload schema, a grader and a renderer key.
// This file is the only public surface of the box. Nothing else in src/ is public.
// Status and version: see docs/07-build-sequence.md.

export { createExerciseTypeRegistry } from './registry';
export type { ExerciseTypeRegistry } from './registry';
export { registerDeterministicTypes } from './deterministic';

export { multipleChoiceType } from './graders/multiple-choice';
export { clozeType } from './graders/cloze';
export { matchPairsType } from './graders/match-pairs';
export { orderWordsType } from './graders/order-words';
export { flashcardType } from './graders/flashcard';
export { readAnswerType } from './graders/read-answer';
export { listenAnswerType } from './graders/listen-answer';
export { dictationType } from './graders/dictation';

export {
  FLASHCARD_RATINGS,
  checkClozeResponse,
  checkDictationResponse,
  checkFlashcardResponse,
  checkListenAnswerResponse,
  checkMatchPairsResponse,
  checkMultipleChoiceResponse,
  checkOrderWordsResponse,
  checkReadAnswerResponse,
} from './responses';
export type {
  ClozeResponse,
  DictationResponse,
  FlashcardRating,
  FlashcardResponse,
  ListenAnswerResponse,
  MatchPairsResponse,
  MultipleChoiceResponse,
  OrderWordsResponse,
  QuestionsResponse,
  ReadAnswerResponse,
  ResponseCheck,
} from './responses';

export { InvalidPayloadError, InvalidResponseError, UnknownExerciseTypeError } from './errors';
