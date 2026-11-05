import { createElement } from 'react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

export type CardElement = 'div' | 'section' | 'article' | 'aside' | 'li';
export type CardHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type CardPadding = 'sm' | 'md';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Element to render. Default `div`. */
  as?: CardElement;
  /** Optional heading shown at the top of the card. */
  title?: ReactNode;
  /** Heading level for `title`, 1 to 6. Default 2. Keep headings in order on the screen. */
  headingLevel?: CardHeadingLevel;
  /** Inner padding. Default `md`. */
  padding?: CardPadding;
  ref?: Ref<HTMLElement>;
}

export function Card({
  as = 'div',
  title,
  headingLevel = 2,
  padding = 'md',
  className,
  children,
  ref,
  ...rest
}: CardProps) {
  const heading =
    title === undefined || title === null
      ? null
      : createElement(`h${headingLevel}`, { className: 'st-card__title' }, title);

  return createElement(
    as,
    { ...rest, ref, className: cx('st-card', `st-card--${padding}`, className) },
    heading,
    children,
  );
}
