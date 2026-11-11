'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import type { ErrorType } from '@stufen/contracts';
import { cx } from './cx';

export interface InlineCorrection {
  /** The part of the learner text that is wrong, exactly as written. */
  span: string;
  errorType: ErrorType;
  /** What it should be. An empty text means the span should be removed. */
  correction: string;
  note?: string;
}

export interface CorrectionInlineLabels {
  /** Words for each error category. */
  errorTypes: Record<ErrorType, string>;
  /** Spoken name of one mark. */
  mark: (parts: { span: string; errorType: string; correction: string }) => string;
  /** Shown in place of an empty correction. Default "remove". */
  remove: string;
  /** Heading of the list of notes, for screen readers. Default "Corrections". */
  notes: string;
}

export interface CorrectionInlineProps {
  /** The learner text. */
  text: string;
  corrections: readonly InlineCorrection[];
  /** BCP 47 tag of the learner text, for example `de`. */
  lang?: string;
  labels?: Partial<Omit<CorrectionInlineLabels, 'errorTypes'>> & {
    errorTypes?: Partial<Record<ErrorType, string>>;
  };
  className?: string;
}

const DEFAULT_ERROR_TYPES: Record<ErrorType, string> = {
  article: 'Article',
  case: 'Case',
  gender: 'Gender',
  word_order: 'Word order',
  spelling: 'Spelling',
  tense: 'Tense',
  register: 'Register',
  vocabulary: 'Vocabulary',
  other: 'Other',
};

function defaultMark(parts: { span: string; errorType: string; correction: string }): string {
  return `${parts.errorType}. "${parts.span}" should be "${parts.correction}".`;
}

interface Placed {
  index: number;
  start: number;
  end: number;
}

function overlaps(placed: readonly Placed[], start: number, end: number): boolean {
  return placed.some((range) => start < range.end && end > range.start);
}

/** Finds each span in the text, first free occurrence first. Spans not found are left out. */
function place(text: string, corrections: readonly InlineCorrection[]): Placed[] {
  const placed: Placed[] = [];
  corrections.forEach((correction, index) => {
    if (correction.span === '') return;
    let start = text.indexOf(correction.span);
    while (start >= 0 && overlaps(placed, start, start + correction.span.length)) {
      start = text.indexOf(correction.span, start + 1);
    }
    if (start >= 0) placed.push({ index, start, end: start + correction.span.length });
  });
  return placed.sort((a, b) => a.start - b.start);
}

/**
 * A learner text with its corrections marked in place. Each mark shows the
 * original, the error category in words and the corrected form, can be
 * reached with Tab, and announces the category and the correction.
 */
export function CorrectionInline({
  text,
  corrections,
  lang,
  labels,
  className,
}: CorrectionInlineProps) {
  const baseId = useId();
  const errorTypes = { ...DEFAULT_ERROR_TYPES, ...labels?.errorTypes };
  const markLabel = labels?.mark ?? defaultMark;
  const removeWord = labels?.remove ?? 'remove';
  const notesHeading = labels?.notes ?? 'Corrections';

  const placed = place(text, corrections);
  const placedIndexes = new Set(placed.map((range) => range.index));
  const hasNote = (correction: InlineCorrection): boolean =>
    correction.note !== undefined && correction.note.trim() !== '';
  // Listed under the text: every note, and every correction not found in the text.
  const listed = corrections
    .map((correction, index) => ({ correction, index }))
    .filter(({ correction, index }) => hasNote(correction) || !placedIndexes.has(index));

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of placed) {
    const correction = corrections[range.index];
    if (correction === undefined) continue;
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    const typeWord = errorTypes[correction.errorType];
    const fixed = correction.correction === '' ? removeWord : correction.correction;
    parts.push(
      <span
        key={`${baseId}-mark-${range.index}`}
        role="group"
        tabIndex={0}
        className="st-correction__mark"
        data-error-type={correction.errorType}
        aria-label={markLabel({ span: correction.span, errorType: typeWord, correction: fixed })}
        aria-describedby={hasNote(correction) ? `${baseId}-note-${range.index}` : undefined}
      >
        <span className="st-correction__original" aria-hidden="true">
          {correction.span}
        </span>
        <span className="st-correction__fix" aria-hidden="true">
          <span className="st-correction__type" lang="">
            {typeWord}
          </span>
          {correction.correction === '' ? <span lang="">{fixed}</span> : fixed}
        </span>
      </span>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <div className={cx('st-correction', className)}>
      <p className="st-correction__text" lang={lang}>
        {parts}
      </p>
      {listed.length > 0 ? (
        <ul className="st-correction__notes" aria-label={notesHeading}>
          {listed.map(({ correction, index }) => (
            <li key={index} className="st-correction__note">
              <span className="st-correction__type">{errorTypes[correction.errorType]}</span>{' '}
              <span lang={lang}>{correction.span}</span>
              <span aria-hidden="true"> → </span>
              <span className="st-visually-hidden">: </span>
              <span lang={correction.correction === '' ? undefined : lang}>
                {correction.correction === '' ? removeWord : correction.correction}
              </span>
              {hasNote(correction) ? (
                <>
                  {'. '}
                  <span id={`${baseId}-note-${index}`}>{correction.note}</span>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
