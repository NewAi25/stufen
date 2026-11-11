'use client';

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cx } from '../components/cx';
import { ExerciseShell, OutcomeMark } from './Shell';
import { shuffledIndexes } from './shuffle';
import { DEFAULT_COMMON_LABELS } from './types';
import type {
  ExerciseCommonLabels,
  ExerciseRendererProps,
  MatchPair,
  MatchPairsPayload,
  MatchPairsValue,
} from './types';

export interface MatchPairsLabels extends ExerciseCommonLabels {
  /** Name of the left column. Default "Left column". */
  leftColumn: string;
  /** Name of the right column. Default "Right column". */
  rightColumn: string;
  /** Says what an item is paired with. Default gives "Paired with hello. Select to undo." */
  pairedWith: (partner: string) => string;
  /** Said on the item that waits for its partner. Default "Selected. Now pick its partner." */
  selected: string;
  /** Name of the list of checked pairs. Default "Your pairs". */
  review: string;
  /** Says what the learner chose for a wrong pair. Default gives "You chose bye". */
  chosen: (partner: string) => string;
  /** Said for a left item that was left without a partner. Default "No partner chosen". */
  notPaired: string;
}

export type MatchPairsExerciseProps = ExerciseRendererProps<
  MatchPairsPayload,
  MatchPairsValue,
  MatchPairsLabels
>;

const DEFAULT_LABELS: MatchPairsLabels = {
  ...DEFAULT_COMMON_LABELS,
  leftColumn: 'Left column',
  rightColumn: 'Right column',
  pairedWith: (partner) => `Paired with ${partner}. Select to undo.`,
  selected: 'Selected. Now pick its partner.',
  review: 'Your pairs',
  chosen: (partner) => `You chose ${partner}`,
  notPaired: 'No partner chosen',
};

type Side = 'left' | 'right';
interface Spot {
  side: Side;
  index: number;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** The key that picks an item: 1 to 9 on the left, a to z on the right. */
function shortcutOf(side: Side, index: number): string | undefined {
  if (side === 'left') return index < 9 ? String(index + 1) : undefined;
  return LETTERS[index];
}

export function MatchPairsExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  instruction,
  className,
}: MatchPairsExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The item that waits for its partner.
  const [pending, setPending] = useState<Spot | null>(null);
  // Roving tabindex: one tab stop per column.
  const [tabStop, setTabStop] = useState<Record<Side, number>>({ left: 0, right: 0 });

  const lefts = payload.pairs.map((pair) => pair.left);
  const rightTexts = payload.pairs.map((pair) => pair.right);
  // The right column is shuffled, or the pairs would sit side by side.
  const rights = shuffledIndexes(rightTexts).map((index) => rightTexts[index] ?? '');
  const columns: Record<Side, string[]> = { left: lefts, right: rights };
  const pairs: MatchPair[] = value?.pairs ?? [];
  const graded = result !== null;
  const locked = disabled || graded;

  function partnerOf(side: Side, text: string): string | undefined {
    const pair = pairs.find((candidate) => candidate[side] === text);
    if (pair === undefined) return undefined;
    return side === 'left' ? pair.right : pair.left;
  }

  function focusItem(side: Side, index: number): void {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-side="${side}"][data-index="${index}"]`)
      ?.focus();
  }

  function pick(side: Side, index: number): void {
    const text = columns[side][index];
    if (locked || text === undefined) return;
    if (partnerOf(side, text) !== undefined) {
      // Picking a paired item undoes its pair.
      onChange({ pairs: pairs.filter((pair) => pair[side] !== text) });
      setPending(null);
      return;
    }
    if (pending === null || pending.side === side) {
      const same = pending !== null && pending.index === index;
      setPending(same ? null : { side, index });
      return;
    }
    const other = columns[pending.side][pending.index] ?? '';
    const pair = side === 'left' ? { left: text, right: other } : { left: other, right: text };
    onChange({ pairs: [...pairs, pair] });
    setPending(null);
  }

  function onItemKeyDown(event: KeyboardEvent<HTMLButtonElement>, side: Side, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const count = columns[side].length;
    const otherSide: Side = side === 'left' ? 'right' : 'left';
    let target: Spot | null = null;
    if (event.key === 'ArrowDown') target = { side, index: (index + 1) % count };
    else if (event.key === 'ArrowUp') target = { side, index: (index - 1 + count) % count };
    else if (event.key === 'Home') target = { side, index: 0 };
    else if (event.key === 'End') target = { side, index: count - 1 };
    else if (event.key === 'ArrowRight' && side === 'left') target = { side: otherSide, index };
    else if (event.key === 'ArrowLeft' && side === 'right') target = { side: otherSide, index };
    if (target === null) return;
    event.preventDefault();
    focusItem(target.side, target.index);
  }

  // Number then letter picks a pair, for example 2 then c. Backspace undoes the last pair.
  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (locked || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Backspace') {
      if (pairs.length === 0) return;
      event.preventDefault();
      onChange({ pairs: pairs.slice(0, -1) });
      return;
    }
    const key = event.key.toLowerCase();
    const leftIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const rightIndex = key.length === 1 ? LETTERS.indexOf(key) : -1;
    const spot: Spot | null =
      leftIndex >= 0 && leftIndex < lefts.length
        ? { side: 'left', index: leftIndex }
        : rightIndex >= 0 && rightIndex < rights.length
          ? { side: 'right', index: rightIndex }
          : null;
    if (spot === null) return;
    event.preventDefault();
    event.stopPropagation();
    pick(spot.side, spot.index);
    focusItem(spot.side, spot.index);
  }

  function renderColumn(side: Side) {
    return (
      <div
        className={cx('st-match__column', `st-match__column--${side}`)}
        role="group"
        aria-label={side === 'left' ? words.leftColumn : words.rightColumn}
      >
        {columns[side].map((text, index) => {
          const partner = partnerOf(side, text);
          const isPending = pending !== null && pending.side === side && pending.index === index;
          const shortcut = shortcutOf(side, index);
          const noteId = `${baseId}-${side}-${index}`;
          const note = partner !== undefined ? words.pairedWith(partner) : words.selected;
          const hasNote = partner !== undefined || isPending;
          return (
            <button
              key={`${index}-${text}`}
              type="button"
              data-side={side}
              data-index={index}
              className={cx(
                'st-match__item',
                partner !== undefined && 'st-match__item--paired',
                isPending && 'st-match__item--pending',
              )}
              aria-pressed={isPending}
              aria-disabled={locked ? true : undefined}
              aria-describedby={hasNote ? noteId : undefined}
              aria-keyshortcuts={shortcut}
              tabIndex={index === tabStop[side] ? 0 : -1}
              onFocus={() => setTabStop((stops) => ({ ...stops, [side]: index }))}
              onClick={() => pick(side, index)}
              onKeyDown={(event) => onItemKeyDown(event, side, index)}
            >
              {shortcut !== undefined ? (
                <kbd className="st-match__key" aria-hidden="true">
                  {shortcut}
                </kbd>
              ) : null}
              <span className="st-match__text" lang={side === 'left' ? lang : undefined}>
                {text}
              </span>
              {partner !== undefined ? (
                <span className="st-match__partner" aria-hidden="true">
                  = <span lang={side === 'right' ? lang : undefined}>{partner}</span>
                </span>
              ) : null}
              {hasNote ? (
                <span className="st-visually-hidden" id={noteId}>
                  {note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <ExerciseShell
      type="match_pairs"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
    >
      {/* The keys are a shortcut. Every item is also a button that takes Enter and a click. */}
      <div className="st-match" ref={rootRef} onKeyDown={onRootKeyDown}>
        {renderColumn('left')}
        {renderColumn('right')}
      </div>
      {graded ? (
        <ul className="st-match__review" aria-label={words.review}>
          {payload.pairs.map((pair, index) => {
            const chosen = partnerOf('left', pair.left);
            const right = result.correct || chosen === pair.right;
            return (
              <li key={index} className="st-match__review-item">
                <span lang={lang}>{pair.left}</span> = <span>{pair.right}</span>{' '}
                <OutcomeMark outcome={right ? 'correct' : 'incorrect'} labels={words} />
                {right ? null : (
                  <span className="st-match__chosen">
                    {' '}
                    {chosen === undefined ? words.notPaired : words.chosen(chosen)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </ExerciseShell>
  );
}
