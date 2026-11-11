import type { HTMLAttributes, Ref } from 'react';
import type { CefrLevel } from '@stufen/contracts';
import { cx } from './cx';

export type LevelBadgeSize = 'sm' | 'md';
export type LevelBadgeTone = 'neutral' | 'accent' | 'success';

export interface LevelBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  level: CefrLevel;
  /** Builds the accessible name. Default gives "Level B1". */
  label?: (level: CefrLevel) => string;
  /** Default `md`. */
  size?: LevelBadgeSize;
  /** Colour of the badge. The level text is always shown, so colour is never the only signal. */
  tone?: LevelBadgeTone;
  ref?: Ref<HTMLSpanElement>;
}

function defaultLabel(level: CefrLevel): string {
  return `Level ${level}`;
}

/** A small badge for a CEFR level. Markup only, renders on the server. */
export function LevelBadge({
  level,
  label = defaultLabel,
  size = 'md',
  tone = 'neutral',
  className,
  ref,
  ...rest
}: LevelBadgeProps) {
  return (
    <span
      {...rest}
      ref={ref}
      role="img"
      aria-label={label(level)}
      data-level={level}
      className={cx(
        'st-level-badge',
        `st-level-badge--${size}`,
        `st-level-badge--${tone}`,
        className,
      )}
    >
      <span aria-hidden="true">{level}</span>
    </span>
  );
}
