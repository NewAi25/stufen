'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioButton } from '../components/AudioButton';
import { Button } from '../components/Button';
import { ExerciseShell } from './Shell';
import {
  DEFAULT_AUDIO_LABELS,
  DEFAULT_COMMON_LABELS,
  FLASHCARD_RATINGS,
  toAudioButtonLabels,
} from './types';
import type {
  ExerciseAudioLabels,
  ExerciseCommonLabels,
  ExerciseRendererProps,
  FlashcardPayload,
  FlashcardRating,
  FlashcardValue,
} from './types';

export interface FlashcardLabels extends ExerciseCommonLabels, ExerciseAudioLabels {
  /** Default "Show answer". */
  reveal: string;
  /** Name of the group of rating buttons. Default "How well did you know it?" */
  rate: string;
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export type FlashcardExerciseProps = ExerciseRendererProps<
  FlashcardPayload,
  FlashcardValue,
  FlashcardLabels
>;

const DEFAULT_LABELS: FlashcardLabels = {
  ...DEFAULT_COMMON_LABELS,
  ...DEFAULT_AUDIO_LABELS,
  reveal: 'Show answer',
  rate: 'How well did you know it?',
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

/** Keys are left alone while focus is in a text field or on another control. */
const KEY_BLOCKERS =
  'input, textarea, select, button, a[href], summary, [role="radio"], [contenteditable]:not([contenteditable="false"])';
const TEXT_FIELDS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function isPlainKey(event: globalThis.KeyboardEvent): boolean {
  return !(event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey);
}

export function FlashcardExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  instruction,
  className,
}: FlashcardExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const backRef = useRef<HTMLDivElement | null>(null);
  const justRevealed = useRef(false);
  // A card that already has a rating is shown open.
  const [opened, setOpened] = useState(false);
  const revealed = opened || value !== null || result !== null;
  const locked = disabled || result !== null;

  function reveal(): void {
    if (disabled || revealed) return;
    justRevealed.current = true;
    setOpened(true);
  }

  function rate(rating: FlashcardRating): void {
    if (locked || !revealed) return;
    onChange({ rating });
  }

  // The reveal button is gone after the flip, so focus moves to the answer.
  useEffect(() => {
    if (!justRevealed.current) return;
    justRevealed.current = false;
    backRef.current?.focus();
  }, [opened]);

  // Space flips the card. 1 to 4 rate it once it is open.
  useEffect(() => {
    if (locked) return undefined;
    function onDocumentKeyDown(event: globalThis.KeyboardEvent): void {
      if (!isPlainKey(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === ' ' && !revealed) {
        if (target !== null && target.closest(KEY_BLOCKERS) !== null) return;
        event.preventDefault();
        reveal();
        return;
      }
      const rating = /^[1-4]$/.test(event.key)
        ? FLASHCARD_RATINGS[Number(event.key) - 1]
        : undefined;
      if (rating === undefined || !revealed) return;
      if (target !== null && target.closest(TEXT_FIELDS) !== null) return;
      event.preventDefault();
      rate(rating);
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  });

  return (
    <ExerciseShell
      type="flashcard"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
    >
      <div className="st-flashcard" data-revealed={revealed}>
        <p className="st-flashcard__front" lang={lang}>
          {payload.front}
        </p>
        {revealed ? (
          <div className="st-flashcard__back" ref={backRef} tabIndex={-1}>
            <p className="st-flashcard__answer">{payload.back}</p>
            {payload.hint !== undefined && payload.hint !== '' ? (
              <p className="st-flashcard__hint">{payload.hint}</p>
            ) : null}
            <AudioButton
              src={payload.audio}
              text={payload.front}
              lang={lang}
              disabled={disabled}
              labels={toAudioButtonLabels(words)}
            />
          </div>
        ) : (
          <Button aria-keyshortcuts="Space" disabled={disabled} onClick={reveal}>
            {words.reveal}
          </Button>
        )}
      </div>
      {revealed ? (
        <div className="st-flashcard__ratings" role="group" aria-label={words.rate}>
          {FLASHCARD_RATINGS.map((rating, index) => (
            <button
              key={rating}
              type="button"
              className="st-flashcard__rating"
              data-rating={rating}
              aria-pressed={value?.rating === rating}
              aria-disabled={locked ? true : undefined}
              aria-keyshortcuts={String(index + 1)}
              onClick={() => rate(rating)}
            >
              <kbd className="st-flashcard__key" aria-hidden="true">
                {index + 1}
              </kbd>
              {words[rating]}
            </button>
          ))}
        </div>
      ) : null}
    </ExerciseShell>
  );
}
