'use client';

import { AudioButton } from '../components/AudioButton';
import { Choice } from '../components/Choice';
import { ExerciseShell } from './Shell';
import { DEFAULT_AUDIO_LABELS, DEFAULT_COMMON_LABELS, toAudioButtonLabels } from './types';
import type {
  ExerciseAudioLabels,
  ExerciseCommonLabels,
  ExerciseRendererProps,
  MultipleChoicePayload,
  MultipleChoiceValue,
} from './types';

export interface MultipleChoiceLabels extends ExerciseCommonLabels, ExerciseAudioLabels {}

export type MultipleChoiceExerciseProps = ExerciseRendererProps<
  MultipleChoicePayload,
  MultipleChoiceValue,
  MultipleChoiceLabels
>;

const DEFAULT_LABELS: MultipleChoiceLabels = { ...DEFAULT_COMMON_LABELS, ...DEFAULT_AUDIO_LABELS };

/** No option has this value, so a revealed selection without an answer key reads as wrong. */
const NO_OPTION = '';

export function MultipleChoiceExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  promptLang,
  instruction,
  className,
}: MultipleChoiceExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const selected = value === null ? null : String(value.selected);
  const graded = result !== null;

  // With an answer key the right option is marked. Without one, the result
  // still says whether the selection was right.
  let correctValue: string | undefined;
  if (graded) {
    if (payload.answer_index !== undefined) correctValue = String(payload.answer_index);
    else correctValue = result.correct && selected !== null ? selected : NO_OPTION;
  }

  return (
    <ExerciseShell
      type="multiple_choice"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
    >
      <p className="st-exercise__prompt" lang={promptLang}>
        {payload.question}
      </p>
      {payload.audio !== undefined && payload.audio !== '' ? (
        <AudioButton
          src={payload.audio}
          lang={lang}
          shortcut
          disabled={disabled}
          labels={toAudioButtonLabels(words)}
        />
      ) : null}
      <Choice
        label={payload.question}
        options={payload.options.map((option, index) => ({
          value: String(index),
          label: option,
          ...(lang === undefined ? {} : { lang }),
        }))}
        value={selected}
        onChange={(next) => onChange({ selected: Number(next) })}
        shortcuts={!graded && !disabled}
        disabled={disabled}
        revealed={graded}
        {...(correctValue === undefined ? {} : { correctValue })}
        stateLabels={{ correct: words.correct, incorrect: words.incorrect }}
      />
    </ExerciseShell>
  );
}
