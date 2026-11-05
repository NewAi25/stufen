// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from '../src/index';

afterEach(cleanup);

describe('Card', () => {
  it('renders its children in a div with md padding by default', () => {
    render(<Card data-testid="card">Nothing due right now.</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card.className.split(' ')).toEqual(['st-card', 'st-card--md']);
    expect(card.textContent).toBe('Nothing due right now.');
  });

  it('renders no heading without a title', () => {
    render(<Card>Body</Card>);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders the title as a level 2 heading by default', () => {
    render(<Card title="Reviews">14 due</Card>);
    const heading = screen.getByRole('heading', { name: 'Reviews', level: 2 });
    expect(heading.tagName).toBe('H2');
  });

  it.each([1, 2, 3, 4, 5, 6] as const)('renders the title at heading level %i', (level) => {
    render(
      <Card title="Reviews" headingLevel={level}>
        14 due
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Reviews', level }).tagName).toBe(`H${level}`);
  });

  it.each(['div', 'section', 'article', 'aside', 'li'] as const)('renders as %s', (as) => {
    render(
      <Card as={as} data-testid="card">
        Body
      </Card>,
    );
    expect(screen.getByTestId('card').tagName).toBe(as.toUpperCase());
  });

  it.each(['sm', 'md'] as const)('supports padding %s', (padding) => {
    render(
      <Card padding={padding} data-testid="card">
        Body
      </Card>,
    );
    expect(screen.getByTestId('card').classList.contains(`st-card--${padding}`)).toBe(true);
  });

  it('keeps a caller class name and passes other attributes through', () => {
    render(
      <Card as="section" className="mine" aria-label="Summary">
        Body
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Summary' });
    expect(region.classList.contains('mine')).toBe(true);
    expect(region.classList.contains('st-card')).toBe(true);
  });

  it('forwards the ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Card as="article" ref={ref}>
        Body
      </Card>,
    );
    expect(ref.current).toBe(screen.getByRole('article'));
  });
});
