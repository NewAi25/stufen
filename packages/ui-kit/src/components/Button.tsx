import type { ComponentProps } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

/** Native button props (including `ref`) plus the kit options. */
export interface ButtonProps extends ComponentProps<'button'> {
  /** Visual weight. One `primary` per screen. Default `primary`. */
  variant?: ButtonVariant;
  /** Default `md`. Both sizes meet the 44 px touch target. */
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy` and disables the button. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx('st-button', `st-button--${variant}`, `st-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? <span className="st-button__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
