'use client';

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { cx } from '../components/cx';
import { ClozeExercise } from './ClozeExercise';
import type { ClozeLabels } from './ClozeExercise';
import { DictationExercise } from './DictationExercise';
import type { DictationLabels } from './DictationExercise';
import { FlashcardExercise } from './FlashcardExercise';
import type { FlashcardLabels } from './FlashcardExercise';
import { isPayloadOf, isRenderableType, valueOf } from './guards';
import { ListenAnswerExercise } from './ListenAnswerExercise';
import type { ListenAnswerLabels } from './ListenAnswerExercise';
import { MatchPairsExercise } from './MatchPairsExercise';
import type { MatchPairsLabels } from './MatchPairsExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import type { MultipleChoiceLabels } from './MultipleChoiceExercise';
import { OrderWordsExercise } from './OrderWordsExercise';
import type { OrderWordsLabels } from './OrderWordsExercise';
import { ReadAnswerExercise } from './ReadAnswerExercise';
import type { ReadAnswerLabels } from './ReadAnswerExercise';
import type {
  ExercisePayloadMap,
  ExerciseRendererProps,
  ExerciseValue,
  ExerciseValueMap,
  RenderableExerciseType,
} from './types';

export interface ExerciseRendererLabels {
  /** Shown for a type the kit has no renderer for, and for a payload it cannot read. */
  unsupported: string;
}

/** The strings of every renderer in one object. Each renderer reads the ones it knows. */
export type ExerciseLabels = MultipleChoiceLabels &
  ClozeLabels &
  MatchPairsLabels &
  OrderWordsLabels &
  FlashcardLabels &
  ReadAnswerLabels &
  ListenAnswerLabels &
  DictationLabels &
  ExerciseRendererLabels;

export interface ExerciseRendererComponentProps {
  /** The exercise type id, for example `cloze`. */
  type: string;
  /** The exercise payload as it comes from the content pack. */
  payload: unknown;
  /** The response so far. Start with `emptyValue(type, payload)`. */
  value: unknown;
  onChange: (value: ExerciseValue) => void;
  disabled?: boolean;
  result?: ExerciseRendererProps<unknown, unknown, unknown>['result'];
  labels?: Partial<ExerciseLabels>;
  lang?: string;
  promptLang?: string;
  instruction?: string;
  className?: string;
}

const DEFAULT_UNSUPPORTED = 'This exercise cannot be shown here yet. Skip it to continue.';

type AnyProps<T extends RenderableExerciseType> = ExerciseRendererProps<
  ExercisePayloadMap[T],
  ExerciseValueMap[T],
  ExerciseLabels
>;

const RENDERERS: { [T in RenderableExerciseType]: (props: AnyProps<T>) => ReactElement } = {
  multiple_choice: MultipleChoiceExercise,
  cloze: ClozeExercise,
  match_pairs: MatchPairsExercise,
  order_words: OrderWordsExercise,
  flashcard: FlashcardExercise,
  read_answer: ReadAnswerExercise,
  listen_answer: ListenAnswerExercise,
  dictation: DictationExercise,
};

function renderTyped<T extends RenderableExerciseType>(
  type: T,
  payload: ExercisePayloadMap[T],
  props: ExerciseRendererComponentProps,
): ReactElement {
  const typed: AnyProps<T> = {
    payload,
    value: valueOf(type, props.value),
    onChange: props.onChange,
    ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
    ...(props.result === undefined ? {} : { result: props.result }),
    ...(props.labels === undefined ? {} : { labels: props.labels }),
    ...(props.lang === undefined ? {} : { lang: props.lang }),
    ...(props.promptLang === undefined ? {} : { promptLang: props.promptLang }),
    ...(props.instruction === undefined ? {} : { instruction: props.instruction }),
    ...(props.className === undefined ? {} : { className: props.className }),
  };
  return createElement(RENDERERS[type], typed);
}

/**
 * Renders the renderer that matches `type`. A type the kit has no renderer
 * for, or a payload that does not fit its type, gives a calm message instead
 * of an error, so one bad exercise never breaks a lesson.
 */
export function ExerciseRenderer(props: ExerciseRendererComponentProps) {
  const { type, payload } = props;
  if (isRenderableType(type) && isPayloadOf(type, payload)) {
    return renderTyped(type, payload, props);
  }
  return (
    <div className={cx('st-exercise', 'st-exercise--unsupported', props.className)}>
      {props.instruction !== undefined && props.instruction !== '' ? (
        <p className="st-exercise__instruction">{props.instruction}</p>
      ) : null}
      <p className="st-exercise__unsupported" role="note">
        {props.labels?.unsupported ?? DEFAULT_UNSUPPORTED}
      </p>
    </div>
  );
}
