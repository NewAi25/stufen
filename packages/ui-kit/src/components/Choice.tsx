'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, Ref } from 'react';
import { cx } from './cx';

export interface ChoiceOption {
  value: string;
  label: string;
  /** Optional second line under the label. */
  description?: string;
  /** This option cannot be picked. Arrow keys and number keys skip it. */
  disabled?: boolean;
  /** Language of the label and description, for example `de`. */
  lang?: string;
}

export interface ChoiceStateLabels {
  /** Word shown on the correct option once revealed. Default "Correct". */
  correct: string;
  /** Word shown on a wrong selection once revealed. Default "Not quite". */
  incorrect: string;
}

export interface ChoiceProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'role' | 'children'
> {
  /** Accessible name of the group, usually the question. Required. */
  label: string;
  options: readonly ChoiceOption[];
  /** Selected value when controlled. `null` means nothing is selected. */
  value?: string | null;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  /** Called with the new value when the selection changes. */
  onChange?: (value: string) => void;
  /**
   * When true, keys 1 to 9 pick the matching option from anywhere on the page.
   * The keys are ignored while focus is in a text field or inside another
   * radiogroup, and while Ctrl, Alt or Meta is held.
   */
  shortcuts?: boolean;
  /** The right answer. Only shown once `revealed` is true. */
  correctValue?: string;
  /** Shows correct and incorrect states and makes the group read only. */
  revealed?: boolean;
  /** Nothing can be picked. Options stay focusable so they can still be read. */
  disabled?: boolean;
  /** Layout direction. Default `vertical`. Arrow keys work the same in both. */
  orientation?: 'vertical' | 'horizontal';
  /** Words for the revealed states, so the host can translate them. */
  stateLabels?: Partial<ChoiceStateLabels>;
  ref?: Ref<HTMLDivElement>;
}

const DEFAULT_STATE_LABELS: ChoiceStateLabels = { correct: 'Correct', incorrect: 'Not quite' };

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

export function Choice({
  label,
  options,
  value,
  defaultValue,
  onChange,
  shortcuts = false,
  correctValue,
  revealed = false,
  disabled = false,
  orientation = 'vertical',
  stateLabels,
  className,
  ref,
  ...rest
}: ChoiceProps) {
  const baseId = useId();
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [innerValue, setInnerValue] = useState<string | null>(defaultValue ?? null);

  const controlled = value !== undefined;
  const selected = controlled ? value : innerValue;
  const locked = disabled || revealed;
  const words = { ...DEFAULT_STATE_LABELS, ...stateLabels };

  const setGroupRef = useCallback(
    (node: HTMLDivElement | null) => {
      groupRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  function select(index: number): boolean {
    const option = options[index];
    if (locked || option === undefined || option.disabled === true) return false;
    if (!controlled) setInnerValue(option.value);
    if (option.value !== selected) onChange?.(option.value);
    return true;
  }

  function focusOption(index: number): void {
    const radios = groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[index]?.focus();
  }

  // Moves from one option to the next enabled one, wrapping at the ends.
  function move(from: number, step: 1 | -1): void {
    const count = options.length;
    for (let n = 1; n <= count; n += 1) {
      const index = (from + step * n + count * n) % count;
      if (select(index)) {
        focusOption(index);
        return;
      }
    }
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (locked || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        move(index, 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        move(-1, 1);
        break;
      case 'End':
        event.preventDefault();
        move(options.length, -1);
        break;
      default:
    }
  }

  // Number keys. Subscribed again on each render so the handler always sees
  // the current selection and options. The cost is one listener swap.
  useEffect(() => {
    if (!shortcuts || locked) return undefined;
    function onDocumentKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!/^[1-9]$/.test(event.key)) return;
      const group = groupRef.current;
      if (group === null) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target !== null) {
        if (target.closest(EDITABLE_SELECTOR) !== null) return;
        const targetGroup = target.closest('[role="radiogroup"]');
        if (targetGroup !== null && targetGroup !== group) return;
      }
      const index = Number(event.key) - 1;
      if (!select(index)) return;
      event.preventDefault();
      if (group.contains(document.activeElement)) focusOption(index);
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  });

  // Roving tabindex: Tab lands on the selected option, or the first enabled one.
  const selectedIndex = options.findIndex(
    (option) => option.value === selected && option.disabled !== true,
  );
  const tabbableIndex =
    selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => option.disabled !== true);

  return (
    <div
      {...rest}
      ref={setGroupRef}
      role="radiogroup"
      aria-label={label}
      aria-orientation={orientation}
      aria-disabled={disabled ? true : undefined}
      aria-readonly={revealed ? true : undefined}
      className={cx('st-choice', `st-choice--${orientation}`, className)}
    >
      {options.map((option, index) => {
        const isSelected = option.value === selected;
        const canJudge = revealed && correctValue !== undefined;
        const isCorrect = canJudge && option.value === correctValue;
        const isIncorrect = canJudge && isSelected && option.value !== correctValue;
        const state = isCorrect ? 'correct' : isIncorrect ? 'incorrect' : undefined;
        const optionDisabled = disabled || option.disabled === true;
        const hasDescription = option.description !== undefined && option.description !== '';
        const labelId = `${baseId}-label-${index}`;
        const descriptionId = `${baseId}-description-${index}`;
        const statusId = `${baseId}-status-${index}`;
        const describedBy = cx(hasDescription && descriptionId, state !== undefined && statusId);
        const hasShortcut = shortcuts && index < 9;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={optionDisabled ? true : undefined}
            aria-labelledby={labelId}
            aria-describedby={describedBy === '' ? undefined : describedBy}
            aria-keyshortcuts={hasShortcut ? String(index + 1) : undefined}
            data-state={state}
            tabIndex={index === tabbableIndex ? 0 : -1}
            className={cx('st-choice__option', state && `st-choice__option--${state}`)}
            onClick={() => select(index)}
            onKeyDown={(event) => onOptionKeyDown(event, index)}
          >
            <span className="st-choice__mark" aria-hidden="true" />
            <span className="st-choice__body">
              <span className="st-choice__label" id={labelId} lang={option.lang}>
                {option.label}
              </span>
              {hasDescription ? (
                <span className="st-choice__description" id={descriptionId} lang={option.lang}>
                  {option.description}
                </span>
              ) : null}
              {state !== undefined ? (
                <span className="st-choice__status" id={statusId}>
                  <span aria-hidden="true">{state === 'correct' ? '✓ ' : '✗ '}</span>
                  {state === 'correct' ? words.correct : words.incorrect}
                </span>
              ) : null}
            </span>
            {hasShortcut ? (
              <kbd className="st-choice__key" aria-hidden="true">
                {index + 1}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
