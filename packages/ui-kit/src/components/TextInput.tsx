'use client';

import { useId } from 'react';
import type { ComponentProps } from 'react';
import { cx } from './cx';

/**
 * Native input props (including `ref`, `value`, `defaultValue`, `onChange`
 * and `lang`) plus the kit options. The native props and the ref go to the
 * input element. `className` goes to the wrapper.
 */
export interface TextInputProps extends Omit<ComponentProps<'input'>, 'children'> {
  /** Visible label, linked to the input. Required. */
  label: string;
  /** Optional help text under the input, linked with `aria-describedby`. */
  hint?: string;
  /** Optional error text. Sets `aria-invalid` and is announced when it appears. */
  error?: string;
  /** Class for the input element itself. */
  inputClassName?: string;
}

export function TextInput({
  label,
  hint,
  error,
  id,
  className,
  inputClassName,
  'aria-describedby': describedBy,
  ...rest
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const hasHint = hint !== undefined && hint !== '';
  const hasError = error !== undefined && error !== '';
  const describedByIds = [describedBy, hasHint ? hintId : null, hasError ? errorId : null]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ');

  return (
    <div className={cx('st-input', className)}>
      <label className="st-input__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        type="text"
        {...rest}
        id={inputId}
        className={cx('st-input__control', inputClassName)}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedByIds === '' ? undefined : describedByIds}
      />
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
