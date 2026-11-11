'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cx } from '../components/cx';
import { ExerciseShell } from './Shell';
import { DEFAULT_COMMON_LABELS } from './types';
import type {
  ExerciseCommonLabels,
  ExerciseRendererProps,
  OrderWordsPayload,
  OrderWordsValue,
} from './types';

export interface OrderWordsLabels extends ExerciseCommonLabels {
  /** Name of the answer line. Default "Your sentence". */
  line: string;
  /** Name of the word bank. Default "Word bank". */
  bank: string;
  /** Shown in the empty answer line. Default "Pick the words in order." */
  empty: string;
  /** Added to the name of a word in the line. Default gives "position 2 of 3". */
  position: (position: number, total: number) => string;
  /** Announced after a word is moved. Default gives "heiße, position 2 of 3". */
  moved: (word: string, position: number, total: number) => string;
  /** Lead of the correct sentence after a wrong answer. Default "Correct order". */
  correctOrder: string;
  /** Read before the first word that differs. Default "first difference". */
  firstDifference: string;
}

export type OrderWordsExerciseProps = ExerciseRendererProps<
  OrderWordsPayload,
  OrderWordsValue,
  OrderWordsLabels
>;

const DEFAULT_LABELS: OrderWordsLabels = {
  ...DEFAULT_COMMON_LABELS,
  line: 'Your sentence',
  bank: 'Word bank',
  empty: 'Pick the words in order.',
  position: (position, total) => `position ${position} of ${total}`,
  moved: (word, position, total) => `${word}, position ${position} of ${total}`,
  correctOrder: 'Correct order',
  firstDifference: 'first difference',
};

/**
 * Which word bank token each placed word is. A word that appears twice in
 * the bank is matched to its first free token. Words not in the bank are dropped.
 */
function placedTokens(words: readonly string[], order: readonly string[]): number[] {
  const used = new Set<number>();
  const tokens: number[] = [];
  for (const word of order) {
    const token = words.findIndex((candidate, index) => candidate === word && !used.has(index));
    if (token >= 0) {
      used.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

type Zone = 'line' | 'bank';

export function OrderWordsExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  instruction,
  className,
}: OrderWordsExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Where focus goes after the next render. A moved word is a new element.
  const focusNext = useRef<{ zone: Zone; token: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const bankWords = payload.words;
  const line = placedTokens(bankWords, value?.order ?? []);
  const bank = bankWords.map((_, token) => token).filter((token) => !line.includes(token));
  const graded = result !== null;
  const locked = disabled || graded;

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-zone="${target.zone}"][data-token="${target.token}"]`)
      ?.focus();
  });

  function commit(tokens: number[]): void {
    onChange({ order: tokens.map((token) => bankWords[token] ?? '') });
  }

  function add(token: number): void {
    if (locked || !bank.includes(token)) return;
    const at = bank.indexOf(token);
    const neighbour = bank[at + 1] ?? bank[at - 1];
    focusNext.current =
      neighbour === undefined ? { zone: 'line', token } : { zone: 'bank', token: neighbour };
    commit([...line, token]);
    setAnnouncement(words.moved(bankWords[token] ?? '', line.length + 1, line.length + 1));
  }

  function remove(position: number): void {
    const token = line[position];
    if (locked || token === undefined) return;
    const neighbour = line[position + 1] ?? line[position - 1];
    focusNext.current =
      neighbour === undefined ? { zone: 'bank', token } : { zone: 'line', token: neighbour };
    commit(line.filter((_, at) => at !== position));
    setAnnouncement('');
  }

  function move(position: number, step: 1 | -1): void {
    const target = position + step;
    const token = line[position];
    const other = line[target];
    if (locked || token === undefined || other === undefined) return;
    const next = [...line];
    next[position] = other;
    next[target] = token;
    focusNext.current = { zone: 'line', token };
    commit(next);
    setAnnouncement(words.moved(bankWords[token] ?? '', target + 1, line.length));
  }

  function onLineKeyDown(event: KeyboardEvent<HTMLButtonElement>, position: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(position, event.key === 'ArrowLeft' ? -1 : 1);
  }

  // Number keys append the nth word of the bank. Backspace takes the last word back.
  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (locked || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Backspace' && line.length > 0) {
      event.preventDefault();
      remove(line.length - 1);
      return;
    }
    const token = /^[1-9]$/.test(event.key) ? bank[Number(event.key) - 1] : undefined;
    if (token === undefined) return;
    event.preventDefault();
    add(token);
  }

  const expected = payload.answer ?? result?.feedback.expected ?? '';
  const expectedWords = expected.split(' ').filter((word) => word !== '');
  const showExpected = graded && !result.correct && expectedWords.length > 0;
  const firstDiff = expectedWords.findIndex((word, index) => word !== bankWords[line[index] ?? -1]);

  return (
    <ExerciseShell
      type="order_words"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
      showExpected={false}
    >
      <div className="st-order" ref={rootRef} onKeyDown={onRootKeyDown}>
        <div className="st-order__line" role="group" aria-label={words.line}>
          {line.length === 0 ? <span className="st-order__empty">{words.empty}</span> : null}
          {line.map((token, position) => (
            <button
              key={token}
              type="button"
              data-zone="line"
              data-token={token}
              className="st-order__word st-order__word--placed"
              aria-disabled={locked ? true : undefined}
              aria-keyshortcuts="ArrowLeft ArrowRight"
              onClick={() => remove(position)}
              onKeyDown={(event) => onLineKeyDown(event, position)}
            >
              <span lang={lang}>{bankWords[token]}</span>
              <span className="st-visually-hidden">
                , {words.position(position + 1, line.length)}
              </span>
            </button>
          ))}
        </div>
        <div className="st-order__bank" role="group" aria-label={words.bank}>
          {bank.map((token, at) => (
            <button
              key={token}
              type="button"
              data-zone="bank"
              data-token={token}
              className={cx('st-order__word', 'st-order__word--bank')}
              aria-disabled={locked ? true : undefined}
              aria-keyshortcuts={at < 9 ? String(at + 1) : undefined}
              onClick={() => add(token)}
            >
              <span lang={lang}>{bankWords[token]}</span>
              {at < 9 && !locked ? (
                <kbd className="st-order__key" aria-hidden="true">
                  {at + 1}
                </kbd>
              ) : null}
            </button>
          ))}
        </div>
        <span className="st-visually-hidden" role="status">
          {announcement}
        </span>
      </div>
      {showExpected ? (
        <p className="st-order__expected">
          {words.correctOrder}:{' '}
          <span lang={lang}>
            {expectedWords.map((word, index) => (
              <span key={index}>
                {index > 0 ? ' ' : null}
                {index === firstDiff ? (
                  <>
                    <span className="st-visually-hidden" lang="">
                      ({words.firstDifference}){' '}
                    </span>
                    <u className="st-order__diff">{word}</u>
                  </>
                ) : (
                  word
                )}
              </span>
            ))}
          </span>
        </p>
      ) : null}
    </ExerciseShell>
  );
}
