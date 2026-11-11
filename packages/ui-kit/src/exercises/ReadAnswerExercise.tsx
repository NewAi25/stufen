'use client';

import { DEFAULT_QUESTION_LABELS, Questions } from './Questions';
import type { QuestionLabels } from './Questions';
import { ExerciseShell } from './Shell';
import { DEFAULT_COMMON_LABELS } from './types';
import type {
  ExerciseCommonLabels,
  ExerciseRendererProps,
  QuestionsValue,
  ReadAnswerPayload,
} from './types';

export interface ReadAnswerLabels extends ExerciseCommonLabels, QuestionLabels {
  /** Accessible name of the passage when it has no title. Default "Text". */
  passage: string;
}

export type ReadAnswerExerciseProps = ExerciseRendererProps<
  ReadAnswerPayload,
  QuestionsValue,
  ReadAnswerLabels
>;

const DEFAULT_LABELS: ReadAnswerLabels = {
  ...DEFAULT_COMMON_LABELS,
  ...DEFAULT_QUESTION_LABELS,
  passage: 'Text',
};

export function ReadAnswerExercise({
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
}: ReadAnswerExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const title = payload.title ?? '';
  // Blank lines in the text separate paragraphs.
  const paragraphs = payload.text.split(/\n\s*\n/).filter((part) => part.trim() !== '');

  return (
    <ExerciseShell
      type="read_answer"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
    >
      <section className="st-passage" lang={lang} aria-label={title === '' ? words.passage : title}>
        {title !== '' ? <h3 className="st-passage__title">{title}</h3> : null}
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="st-passage__text">
            {paragraph}
          </p>
        ))}
      </section>
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
    </ExerciseShell>
  );
}
