// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LevelBadge } from '../src/index';

afterEach(cleanup);

describe('LevelBadge', () => {
  it('shows the level and is named "Level B1"', () => {
    render(<LevelBadge level="B1" />);
    const badge = screen.getByRole('img', { name: 'Level B1' });
    expect(badge.textContent).toBe('B1');
    expect(badge.getAttribute('data-level')).toBe('B1');
    expect(badge.classList.contains('st-level-badge')).toBe(true);
    expect(badge.classList.contains('st-level-badge--md')).toBe(true);
    expect(badge.classList.contains('st-level-badge--neutral')).toBe(true);
  });

  it('takes a label builder so the host can translate the name', () => {
    render(<LevelBadge level="A2" label={(level) => `Stufe ${level}`} />);
    expect(screen.getByRole('img', { name: 'Stufe A2' })).toBeTruthy();
  });

  it('takes size, tone, className, ref and native props', () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <LevelBadge level="C2" size="sm" tone="success" className="mine" ref={ref} title="Top" />,
    );
    const badge = screen.getByRole('img', { name: 'Level C2' });
    expect(ref.current).toBe(badge);
    expect(badge.className).toBe('st-level-badge st-level-badge--sm st-level-badge--success mine');
    expect(badge.getAttribute('title')).toBe('Top');
  });
});
