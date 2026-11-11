'use client';

import { Fragment, useId } from 'react';
import { cx } from '../components/cx';
import { CLOZE_GAP } from './guards';
import { ExerciseShell, OutcomeMark } from './Shell';
import { DEFAULT_COMMON_LABELS } from './types';
import type {
  ClozeBlank,
  ClozePayload,
  ClozeValue,
  ExerciseCommonLabels,
  ExerciseRendererProps,
} from './types';
import { looseMatch } from './values';

export interface ClozeLabels extends ExerciseCommonLabels {
  /** Accessible name of one gap. Default gives "Blank 1 of 3". */
  blank: (position: number, total: number) => string;
}

export type ClozeExerciseProps = ExerciseRendererProps<ClozePayload, ClozeValue, ClozeLabels>;

const DEFAULT_LABELS: ClozeLabels = {
  ...DEFAULT_COMMON_LABELS,
  blank: (position, total) => `Blank ${position} of ${total}`,
};

/** Whether one gap is right, or null when that cannot be told without the answer key. */
function judge(blank: ClozeBlank | undefined, typed: string, allCorrect: boolean): boolean | null {
  if (allCorrect) return true;
  if (blank?.answer === undefined) return null;
  return looseMatch(typed, [blank.answer, ...(blank.accept ?? [])]);
}

export function ClozeExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  instruction,
  className,
}: ClozeExerciseProps) {
  const baseId = useId();
  const words = { ...DEFAULT_LABELS, ...labels };
  const segments = payload.text.split(CLOZE_GAP);
  const total = segments.length - 1;
  const answers = Array.from({ length: total }, (_, index) => value?.answers[index] ?? '');
  const graded = result !== null;
  const hasKeys = payload.blanks.some((blank) => blank.answer !== undefined);

  function setAnswer(index: number, text: string): void {
    if (graded || disabled) return;
    onChange({ answers: answers.map((answer, at) => (at === index ? text : answer)) });
  }

  return (
    <ExerciseShell
      type="cloze"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
      showExpected={!hasKeys}
    >
      <p className="st-cloze__text" lang={lang}>
        {segments.map((segment, index) => {
          if (index === total) return <Fragment key={index}>{segment}</Fragment>;
          const blank = payload.blanks[index];
          const typed = answers[index] ?? '';
          const right = graded ? judge(blank, typed, result.correct) : null;
          const hint = blank?.hint ?? '';
          const hintId = `${baseId}-hint-${index}`;
          const markId = `${baseId}-mark-${index}`;
          const describedBy = cx(hint !== '' && hintId, right !== null && markId);
          const width = Math.max(blank?.answer?.length ?? 6, typed.length, 3) + 2;
          return (
            <Fragment key={index}>
              {segment}
              <span className="st-cloze__gap" data-state={gapState(right)}>
                <input
                  type="text"
                  className="st-cloze__input"
                  aria-label={words.blank(index + 1, total)}
                  aria-describedby={describedBy === '' ? undefined : describedBy}
                  aria-invalid={right === false ? true : undefined}
                  value={typed}
                  size={width}
                  disabled={disabled}
                  readOnly={graded}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setAnswer(index, event.target.value)}
                />
                {hint !== '' ? (
                  <span className="st-cloze__hint" id={hintId} lang="">
                    {hint}
                  </span>
                ) : null}
                {right !== null ? (
                  <span className="st-cloze__result" id={markId} lang="">
                    <OutcomeMark outcome={right ? 'correct' : 'incorrect'} labels={words} />
                    {!right && blank?.answer !== undefined ? (
                      <span className="st-cloze__expected" lang={lang}>
                        {' '}
                        {blank.answer}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </Fragment>
          );
        })}
      </p>
    </ExerciseShell>
  );
}

function gapState(right: boolean | null): 'correct' | 'incorrect' | undefined {
  if (right === null) return undefined;
  return right ? 'correct' : 'incorrect';
}
