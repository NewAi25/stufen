// The frame every renderer shares: instruction line, the exercise itself,
// then the feedback slot. Markup only. Internal to the kit.

import type { ReactNode } from 'react';
import { cx } from '../components/cx';
import { outcomeOf } from './types';
import type { ExerciseCommonLabels, ExerciseOutcome, ExerciseResult } from './types';

const ICONS: Record<ExerciseOutcome, string> = { correct: '✓', partial: '~', incorrect: '✗' };

export function outcomeWord(outcome: ExerciseOutcome, labels: ExerciseCommonLabels): string {
  if (outcome === 'correct') return labels.correct;
  return outcome === 'partial' ? labels.partial : labels.incorrect;
}

/** A tick or a cross with the word beside it, so colour is never the only signal. */
export function OutcomeMark({
  outcome,
  labels,
}: {
  outcome: ExerciseOutcome;
  labels: ExerciseCommonLabels;
}) {
  return (
    <span className={cx('st-exercise__mark', `st-exercise__mark--${outcome}`)}>
      <span aria-hidden="true">{ICONS[outcome]} </span>
      {outcomeWord(outcome, labels)}
    </span>
  );
}

interface ShellProps {
  type: string;
  instruction: string | undefined;
  result: ExerciseResult | null | undefined;
  labels: ExerciseCommonLabels;
  lang: string | undefined;
  className: string | undefined;
  /** False when the renderer shows the expected answer in place. Default true. */
  showExpected?: boolean;
  children: ReactNode;
}

export function ExerciseShell({
  type,
  instruction,
  result,
  labels,
  lang,
  className,
  showExpected = true,
  children,
}: ShellProps) {
  const outcome = outcomeOf(result);
  const feedback = result?.feedback;
  const word = outcome === null ? '' : outcomeWord(outcome, labels);
  // Grader messages usually open with the outcome word. It is not said twice.
  const message = feedback?.message ?? '';
  const repeats = word !== '' && message.toLowerCase().startsWith(word.toLowerCase());
  const hasExpected = showExpected && feedback?.expected !== undefined && feedback.expected !== '';

  return (
    <div
      className={cx('st-exercise', `st-exercise--${type}`, className)}
      data-outcome={outcome ?? undefined}
    >
      {instruction !== undefined && instruction !== '' ? (
        <p className="st-exercise__instruction">{instruction}</p>
      ) : null}
      {children}
      {outcome !== null && feedback !== undefined ? (
        <div
          className={cx('st-exercise__feedback', `st-exercise__feedback--${outcome}`)}
          role="alert"
        >
          <p className="st-exercise__feedback-message">
            <span aria-hidden="true">{ICONS[outcome]} </span>
            {repeats ? null : <strong>{word}. </strong>}
            {message}
          </p>
          {hasExpected ? (
            <p className="st-exercise__feedback-expected">
              {labels.expected}: <span lang={lang}>{feedback.expected}</span>
            </p>
          ) : null}
          {feedback.explanation !== undefined && feedback.explanation !== '' ? (
            <p className="st-exercise__feedback-explanation">{feedback.explanation}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
