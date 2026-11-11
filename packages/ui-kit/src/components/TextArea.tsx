'use client';

import { useId, useState } from 'react';
import type { ChangeEvent, ComponentProps } from 'react';
import { cx } from './cx';

/**
 * Native textarea props (including `ref`, `value`, `defaultValue`, `onChange`,
 * `rows` and `lang`) plus the kit options. The native props and the ref go to
 * the textarea element. `className` goes to the wrapper.
 */
export interface TextAreaProps extends Omit<ComponentProps<'textarea'>, 'children'> {
  /** Visible label, linked to the textarea. Required. */
  label: string;
  /** Optional help text under the textarea, linked with `aria-describedby`. */
  hint?: string;
  /** Optional error text. Sets `aria-invalid` and is announced when it appears. */
  error?: string;
  /** Class for the textarea element itself. */
  inputClassName?: string;
  /**
   * Words announced when the text is within 10 percent of `maxLength`.
   * Default: "40 characters left".
   */
  remainingLabel?: (remaining: number, maxLength: number) => string;
}

function defaultRemainingLabel(remaining: number): string {
  return remaining === 1 ? '1 character left' : `${remaining} characters left`;
}

function lengthOf(value: TextAreaProps['value']): number {
  if (value === undefined) return 0;
  return Array.isArray(value) ? value.join(',').length : String(value).length;
}

export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  inputClassName,
  remainingLabel = defaultRemainingLabel,
  maxLength,
  rows = 4,
  value,
  defaultValue,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const countId = `${inputId}-count`;
  const [innerLength, setInnerLength] = useState(() => lengthOf(defaultValue));

  const controlled = value !== undefined;
  const length = controlled ? lengthOf(value) : innerLength;
  const hasHint = hint !== undefined && hint !== '';
  const hasError = error !== undefined && error !== '';
  const hasCount = typeof maxLength === 'number' && maxLength > 0;
  const remaining = hasCount ? Math.max(maxLength - length, 0) : 0;
  const nearLimit = hasCount && maxLength - length <= maxLength / 10;
  const describedByIds = [
    describedBy,
    hasHint ? hintId : null,
    hasCount ? countId : null,
    hasError ? errorId : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ');

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    if (!controlled) setInnerLength(event.target.value.length);
    onChange?.(event);
  }

  return (
    <div className={cx('st-input', 'st-textarea', className)}>
      <label className="st-input__label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={inputId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        className={cx('st-input__control', 'st-textarea__control', inputClassName)}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedByIds === '' ? undefined : describedByIds}
      />
      {hasHint ? (
        <p className="st-input__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {hasCount ? (
        <p
          className={cx('st-textarea__count', nearLimit && 'st-textarea__count--near')}
          id={countId}
        >
          {length} / {maxLength}
        </p>
      ) : null}
      {hasCount ? (
        // Always in the page so screen readers announce the text when it appears.
        <p className="st-visually-hidden" role="status" aria-live="polite">
          {nearLimit ? remainingLabel(remaining, maxLength) : ''}
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
