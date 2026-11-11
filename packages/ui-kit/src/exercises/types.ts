// Shared contract of the exercise renderers.
//
// The payload shapes repeat content/schema/exercise.schema.json and the value
// shapes repeat the responses the graders in core-exercise-types expect. They
// are declared here because the kit may import types from contracts only.
// Answer keys are optional: a host may strip them before the payload reaches
// the browser, and every renderer works without them.

export const RENDERABLE_TYPES = [
  'multiple_choice',
  'cloze',
  'match_pairs',
  'order_words',
  'flashcard',
  'read_answer',
  'listen_answer',
  'dictation',
] as const;
export type RenderableExerciseType = (typeof RENDERABLE_TYPES)[number];

// ---------- payloads ----------

export interface MultipleChoicePayload {
  question: string;
  options: string[];
  answer_index?: number;
  explanation_en?: string;
  audio?: string;
}

export interface ClozeBlank {
  answer?: string;
  accept?: string[];
  hint?: string;
}

export interface ClozePayload {
  /** Text with one `___` (three underscores) per blank. */
  text: string;
  blanks: ClozeBlank[];
  explanation_en?: string;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface MatchPairsPayload {
  pairs: MatchPair[];
}

export interface OrderWordsPayload {
  /** Tokens in shuffled order. */
  words: string[];
  answer?: string;
  accept?: string[];
}

export interface FlashcardPayload {
  front: string;
  back: string;
  hint?: string;
  audio?: string;
}

export interface QuestionPayload {
  question: string;
  /** Without options the question takes a short typed answer. */
  options?: string[];
  answer_index?: number;
  explanation_en?: string;
}

export interface ReadAnswerPayload {
  text: string;
  title?: string;
  questions: QuestionPayload[];
}

export interface ListenAnswerPayload {
  /** Spoken by speech synthesis when `audio` is absent. Shown only after the answer. */
  transcript: string;
  audio?: string;
  questions: QuestionPayload[];
}

export interface DictationPayload {
  /** What is spoken. Never shown before the answer. */
  text: string;
  audio?: string;
  accept?: string[];
}

// ---------- values: the response each grader expects ----------

/** Index into the payload options. */
export interface MultipleChoiceValue {
  selected: number;
}

/** One text per blank, in order. An empty text is a blank not filled yet. */
export interface ClozeValue {
  answers: string[];
}

export interface MatchPairsValue {
  pairs: MatchPair[];
}

/** The tokens in the chosen order. */
export interface OrderWordsValue {
  order: string[];
}

export const FLASHCARD_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type FlashcardRating = (typeof FLASHCARD_RATINGS)[number];

export interface FlashcardValue {
  rating: FlashcardRating;
}

/** One answer per question: an option index or a short text. `''` is not answered yet. */
export interface QuestionsValue {
  answers: (number | string)[];
}

/** `replays` counts how often the audio was started again after the first play. */
export interface DictationValue {
  text: string;
  replays?: number;
}

export interface ExercisePayloadMap {
  multiple_choice: MultipleChoicePayload;
  cloze: ClozePayload;
  match_pairs: MatchPairsPayload;
  order_words: OrderWordsPayload;
  flashcard: FlashcardPayload;
  read_answer: ReadAnswerPayload;
  listen_answer: ListenAnswerPayload;
  dictation: DictationPayload;
}

export interface ExerciseValueMap {
  multiple_choice: MultipleChoiceValue;
  cloze: ClozeValue;
  match_pairs: MatchPairsValue;
  order_words: OrderWordsValue;
  flashcard: FlashcardValue;
  read_answer: QuestionsValue;
  listen_answer: QuestionsValue;
  dictation: DictationValue;
}

export type ExercisePayload = ExercisePayloadMap[RenderableExerciseType];
export type ExerciseValue = ExerciseValueMap[RenderableExerciseType];

// ---------- result and props ----------

/** The part of a GradeResult a renderer shows. A GradeResult from contracts fits. */
export interface ExerciseResult {
  correct: boolean;
  /** 0 to 1. */
  score: number;
  feedback: { message: string; explanation?: string; expected?: string };
}

/**
 * Props every renderer takes. A renderer is controlled: it shows `value` and
 * reports each change through `onChange`. It never grades.
 */
export interface ExerciseRendererProps<Payload, Value, Labels> {
  payload: Payload;
  /** The response so far. `null` means nothing has been answered. */
  value: Value | null;
  onChange: (value: Value) => void;
  /** Nothing can be changed. Set while grading. */
  disabled?: boolean;
  /** The grade, once there is one. Makes the renderer read only. */
  result?: ExerciseResult | null;
  /** Every visible string, with English defaults. */
  labels?: Partial<Labels>;
  /** BCP 47 tag of the target language, for example `de`. Set on target language text. */
  lang?: string;
  /**
   * Language of the questions, when it is known. The payload does not say
   * whether a question is in English or in the target language, so nothing
   * is set without this.
   */
  promptLang?: string;
  /** The instruction line above the exercise, for example "Fill the gap." */
  instruction?: string;
  className?: string;
}

/** Strings every renderer shares. Each renderer adds its own to these. */
export interface ExerciseCommonLabels {
  /** Default "Correct". */
  correct: string;
  /** Default "Not quite". */
  incorrect: string;
  /** Shown when the score is above 0 but the answer is not correct. Default "Partly correct". */
  partial: string;
  /** Lead of the expected answer in the feedback. Default "Answer". */
  expected: string;
}

export const DEFAULT_COMMON_LABELS: ExerciseCommonLabels = {
  correct: 'Correct',
  incorrect: 'Not quite',
  partial: 'Partly correct',
  expected: 'Answer',
};

export type ExerciseOutcome = 'correct' | 'partial' | 'incorrect';

/** The outcome a result stands for, or null while there is no result. */
export function outcomeOf(result: ExerciseResult | null | undefined): ExerciseOutcome | null {
  if (result === null || result === undefined) return null;
  if (result.correct) return 'correct';
  return result.score > 0 ? 'partial' : 'incorrect';
}

/** Strings of the audio button, for the renderers that have one. */
export interface ExerciseAudioLabels {
  /** Default "Play audio". */
  playAudio: string;
  /** Default "Stop audio". */
  stopAudio: string;
  audioError: string;
  audioUnavailable: string;
}

export const DEFAULT_AUDIO_LABELS: ExerciseAudioLabels = {
  playAudio: 'Play audio',
  stopAudio: 'Stop audio',
  audioError: 'The audio did not play. Try again.',
  audioUnavailable: 'Audio is not available in this browser.',
};

/** The audio strings in the shape AudioButton takes. */
export function toAudioButtonLabels(labels: ExerciseAudioLabels): {
  play: string;
  stop: string;
  error: string;
  unavailable: string;
} {
  return {
    play: labels.playAudio,
    stop: labels.stopAudio,
    error: labels.audioError,
    unavailable: labels.audioUnavailable,
  };
}
