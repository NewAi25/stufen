'use client';

import { useId, useState } from 'react';
import { AudioButton } from '../components/AudioButton';
import { Button } from '../components/Button';
import { DEFAULT_QUESTION_LABELS, Questions } from './Questions';
import type { QuestionLabels } from './Questions';
import { ExerciseShell } from './Shell';
import { DEFAULT_AUDIO_LABELS, DEFAULT_COMMON_LABELS, toAudioButtonLabels } from './types';
import type {
  ExerciseAudioLabels,
  ExerciseCommonLabels,
  ExerciseRendererProps,
  ListenAnswerPayload,
  QuestionsValue,
} from './types';

export interface ListenAnswerLabels
  extends ExerciseCommonLabels, ExerciseAudioLabels, QuestionLabels {
  /** Default "Show transcript". */
  showTranscript: string;
  /** Default "Hide transcript". */
  hideTranscript: string;
  /** Accessible name of the transcript. Default "Transcript". */
  transcript: string;
}

export type ListenAnswerExerciseProps = ExerciseRendererProps<
  ListenAnswerPayload,
  QuestionsValue,
  ListenAnswerLabels
>;

const DEFAULT_LABELS: ListenAnswerLabels = {
  ...DEFAULT_COMMON_LABELS,
  ...DEFAULT_AUDIO_LABELS,
  ...DEFAULT_QUESTION_LABELS,
  showTranscript: 'Show transcript',
  hideTranscript: 'Hide transcript',
  transcript: 'Transcript',
};

export function ListenAnswerExercise({
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
}: ListenAnswerExerciseProps) {
  const transcriptId = useId();
  const words = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  const graded = result !== null;

  return (
    <ExerciseShell
      type="listen_answer"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
    >
      {/* Without a file the transcript is spoken. It is not in the page before the answer. */}
      <AudioButton
        src={payload.audio}
        text={payload.transcript}
        lang={lang}
        shortcut
        disabled={disabled}
        labels={toAudioButtonLabels(words)}
      />
      <Questions
        questions={payload.questions}
        value={value}
        onChange={onChange}
        disabled={disabled}
        result={result}
        labels={words}
        lang={lang}
        promptLang={promptLang}
      />
      {graded ? (
        <div className="st-transcript">
          <Button
            variant="ghost"
            aria-expanded={open}
            aria-controls={open ? transcriptId : undefined}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? words.hideTranscript : words.showTranscript}
          </Button>
          {open ? (
            <div id={transcriptId}>
              <span className="st-visually-hidden">{words.transcript}: </span>
              <p className="st-transcript__text" lang={lang}>
                {payload.transcript}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </ExerciseShell>
  );
}
