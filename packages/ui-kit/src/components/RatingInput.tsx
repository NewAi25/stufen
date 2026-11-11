'use client';

import { useId, useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent } from 'react';
import { cx } from './cx';

export interface RatingInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'role' | 'children'
> {
  /** Visible label that names the group. Required. */
  label: string;
  /** Highest value. Whole number from 2 to 9, default 5. The lowest is always 1. */
  max?: number;
  /** Selected value when controlled. `null` means nothing is selected. */
  value?: number | null;
  /** Initial selection when uncontrolled. */
  defaultValue?: number;
  /** Called with the new value, or with `null` when the selection is cleared. */
  onChange?: (value: number | null) => void;
  /** Words under the lowest value, for example "Poor". */
  lowLabel?: string;
  /** Words under the highest value, for example "Great". */
  highLabel?: string;
  /**
   * When true the selection can be removed: pick the selected value again,
   * or press Backspace, Delete or 0 while focus is in the group.
   */
  allowClear?: boolean;
  /** Accessible name of one option. Default "1 of 5". */
  optionLabel?: (value: number, max: number) => string;
  /** Optional help text, linked with `aria-describedby`. */
  hint?: string;
  /** Optional error text. Sets `aria-invalid` and is announced when it appears. */
  error?: string;
  /** Marks the group as required for assistive technology. */
  required?: boolean;
  /** Nothing can be picked. Options stay focusable so they can still be read. */
  disabled?: boolean;
}

function defaultOptionLabel(value: number, max: number): string {
  return `${value} of ${max}`;
}

/** Keeps `max` a whole number from 2 to 9, so number keys can reach every value. */
function clampMax(max: number): number {
  if (!Number.isFinite(max)) return 5;
  return Math.min(Math.max(Math.round(max), 2), 9);
}

export function RatingInput({
  label,
  max = 5,
  value,
  defaultValue,
  onChange,
  lowLabel,
  highLabel,
  allowClear = false,
  optionLabel = defaultOptionLabel,
  hint,
  error,
  required = false,
  disabled = false,
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: RatingInputProps) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const lowId = `${baseId}-low`;
  const highId = `${baseId}-high`;
  const groupRef = useRef<HTMLDivElement | null>(null);
  const [innerValue, setInnerValue] = useState<number | null>(defaultValue ?? null);

  const count = clampMax(max);
  const controlled = value !== undefined;
  const selected = controlled ? value : innerValue;
  const hasHint = hint !== undefined && hint !== '';
  const hasError = error !== undefined && error !== '';
  const hasLow = lowLabel !== undefined && lowLabel !== '';
  const hasHigh = highLabel !== undefined && highLabel !== '';
  const describedByIds = cx(describedBy, hasHint && hintId, hasError && errorId);

  function commit(next: number | null): void {
    if (disabled || next === selected) return;
    if (!controlled) setInnerValue(next);
    onChange?.(next);
  }

  function focusOption(option: number): void {
    const radios = groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[option - 1]?.focus();
  }

  function pick(option: number): void {
    commit(option);
    focusOption(option);
  }

  function onOptionClick(option: number): void {
    commit(allowClear && option === selected ? null : option);
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, option: number): void {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      pick(option === count ? 1 : option + 1);
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      pick(option === 1 ? count : option - 1);
    } else if (key === 'Home') {
      event.preventDefault();
      pick(1);
    } else if (key === 'End') {
      event.preventDefault();
      pick(count);
    } else if (/^[1-9]$/.test(key) && Number(key) <= count) {
      event.preventDefault();
      pick(Number(key));
    } else if (allowClear && (key === 'Backspace' || key === 'Delete' || key === '0')) {
      event.preventDefault();
      commit(null);
      focusOption(1);
    }
  }

  // Roving tabindex: Tab lands on the selected value, or on 1.
  const tabbable =
    typeof selected === 'number' && selected >= 1 && selected <= count ? selected : 1;
  const options = Array.from({ length: count }, (_, index) => index + 1);

  return (
    <div className={cx('st-rating', className)}>
      <span className="st-rating__label" id={labelId}>
        {label}
      </span>
      <div
        {...rest}
        ref={groupRef}
        id={baseId}
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedByIds === '' ? undefined : describedByIds}
        aria-invalid={hasError ? true : undefined}
        aria-required={required ? true : undefined}
        aria-disabled={disabled ? true : undefined}
        aria-orientation="horizontal"
        className="st-rating__options"
      >
        {options.map((option) => {
          const edgeId =
            option === 1 && hasLow ? lowId : option === count && hasHigh ? highId : undefined;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === selected}
              aria-label={optionLabel(option, count)}
              aria-describedby={edgeId}
              aria-disabled={disabled ? true : undefined}
              tabIndex={option === tabbable ? 0 : -1}
              className="st-rating__option"
              onClick={() => onOptionClick(option)}
              onKeyDown={(event) => onOptionKeyDown(event, option)}
            >
              <span aria-hidden="true">{option}</span>
            </button>
          );
        })}
      </div>
      {hasLow || hasHigh ? (
        <div className="st-rating__scale">
          <span className="st-rating__low" id={lowId}>
            {hasLow ? lowLabel : ''}
          </span>
          <span className="st-rating__high" id={highId}>
            {hasHigh ? highLabel : ''}
          </span>
        </div>
      ) : null}
      {hasHint ? (
        <p className="st-input__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p className="st-input__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
