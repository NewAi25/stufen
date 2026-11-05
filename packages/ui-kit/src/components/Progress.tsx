import type { HTMLAttributes, Ref } from 'react';
import { cx } from './cx';

export type ProgressSize = 'sm' | 'md';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  /** Current value. Clamped to the range 0 to `max`. */
  value: number;
  /** Upper bound. Default 100. A value that is not a positive number is treated as 0. */
  max?: number;
  /** Accessible name, for example "Lesson progress". Required. */
  label: string;
  /** Optional spoken value, for example "5 of 12". Sets `aria-valuetext`. */
  valueText?: string;
  /** `sm` is the thin bar. Default `md`. */
  size?: ProgressSize;
  ref?: Ref<HTMLDivElement>;
}

export function Progress({
  value,
  max = 100,
  label,
  valueText,
  size = 'md',
  className,
  ref,
  ...rest
}: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percent = safeMax === 0 ? 0 : (safeValue / safeMax) * 100;

  return (
    <div
      {...rest}
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={valueText}
      className={cx('st-progress', `st-progress--${size}`, className)}
    >
      <div className="st-progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}
