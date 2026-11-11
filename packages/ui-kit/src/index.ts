// @stufen/ui-kit
// Design tokens and presentational components.
// This file is the only public surface of the box. Everything exported here
// is listed in the README. Nothing else in src/ is public.
// Status: see docs/07-build-sequence.md.
//
// Styles are not imported here. The host app imports
// '@stufen/ui-kit/src/styles.css' once.

export { THEMES, tokens, cssVariables } from './tokens';
export type { Theme, Tokens, ColorTokens, TextStep } from './tokens';

export { Button } from './components/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button';

export { Card } from './components/Card';
export type { CardProps, CardElement, CardHeadingLevel, CardPadding } from './components/Card';

export { Progress } from './components/Progress';
export type { ProgressProps, ProgressSize } from './components/Progress';

export { TextInput } from './components/TextInput';
export type { TextInputProps } from './components/TextInput';

export { Choice } from './components/Choice';
export type { ChoiceProps, ChoiceOption, ChoiceStateLabels } from './components/Choice';

export { TextArea } from './components/TextArea';
export type { TextAreaProps } from './components/TextArea';

export { RatingInput } from './components/RatingInput';
export type { RatingInputProps } from './components/RatingInput';

export { Sheet } from './components/Sheet';
export type { SheetProps, SheetSide } from './components/Sheet';

export { FeedbackFab } from './components/FeedbackFab';
export type {
  FeedbackFabProps,
  FeedbackFabInput,
  FeedbackFabLabels,
} from './components/FeedbackFab';

export { ToastProvider, useToast } from './components/Toast';
export type {
  ToastProviderProps,
  ToastOptions,
  ToastTone,
  ToastApi,
  ToastTimer,
} from './components/Toast';

export { RENDERABLE_TYPES, FLASHCARD_RATINGS } from './exercises/types';
export type {
  RenderableExerciseType,
  ExerciseResult,
  ExerciseRendererProps,
  ExercisePayload,
  ExercisePayloadMap,
  ExerciseValue,
  ExerciseValueMap,
  MultipleChoicePayload,
  MultipleChoiceValue,
  ClozePayload,
  ClozeBlank,
  ClozeValue,
  MatchPair,
  MatchPairsPayload,
  MatchPairsValue,
  OrderWordsPayload,
  OrderWordsValue,
  FlashcardPayload,
  FlashcardRating,
  FlashcardValue,
  QuestionPayload,
  QuestionsValue,
  ReadAnswerPayload,
  ListenAnswerPayload,
  DictationPayload,
  DictationValue,
} from './exercises/types';
export { emptyValue, isComplete } from './exercises/values';

export { LevelBadge } from './components/LevelBadge';
export type { LevelBadgeProps, LevelBadgeSize, LevelBadgeTone } from './components/LevelBadge';

export { AudioButton } from './components/AudioButton';
export type {
  AudioButtonProps,
  AudioButtonLabels,
  AudioButtonState,
} from './components/AudioButton';

export { CorrectionInline } from './components/CorrectionInline';
export type {
  CorrectionInlineProps,
  CorrectionInlineLabels,
  InlineCorrection,
} from './components/CorrectionInline';

export { MultipleChoiceExercise } from './exercises/MultipleChoiceExercise';
export type {
  MultipleChoiceExerciseProps,
  MultipleChoiceLabels,
} from './exercises/MultipleChoiceExercise';
export type { ExerciseCommonLabels, ExerciseAudioLabels, ExerciseOutcome } from './exercises/types';

export { ClozeExercise } from './exercises/ClozeExercise';
export type { ClozeExerciseProps, ClozeLabels } from './exercises/ClozeExercise';

export { MatchPairsExercise } from './exercises/MatchPairsExercise';
export type { MatchPairsExerciseProps, MatchPairsLabels } from './exercises/MatchPairsExercise';

export { OrderWordsExercise } from './exercises/OrderWordsExercise';
export type { OrderWordsExerciseProps, OrderWordsLabels } from './exercises/OrderWordsExercise';

export { FlashcardExercise } from './exercises/FlashcardExercise';
export type { FlashcardExerciseProps, FlashcardLabels } from './exercises/FlashcardExercise';

export { ReadAnswerExercise } from './exercises/ReadAnswerExercise';
export type { ReadAnswerExerciseProps, ReadAnswerLabels } from './exercises/ReadAnswerExercise';
export type { QuestionLabels } from './exercises/Questions';

export { ListenAnswerExercise } from './exercises/ListenAnswerExercise';
export type {
  ListenAnswerExerciseProps,
  ListenAnswerLabels,
} from './exercises/ListenAnswerExercise';

export { DictationExercise } from './exercises/DictationExercise';
export type { DictationExerciseProps, DictationLabels } from './exercises/DictationExercise';

export { ExerciseRenderer } from './exercises/ExerciseRenderer';
export type {
  ExerciseRendererComponentProps,
  ExerciseRendererLabels,
  ExerciseLabels,
} from './exercises/ExerciseRenderer';

export { LevelMap } from './components/LevelMap';
export type {
  LevelMapProps,
  LevelMapLevel,
  LevelMapDescriptor,
  LevelMapLabels,
  LevelMapStatus,
  LevelMapCheckpoint,
} from './components/LevelMap';
