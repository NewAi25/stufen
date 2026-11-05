// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Progress } from '../src/index';

afterEach(cleanup);

function bar(): HTMLElement {
  return screen.getByRole('progressbar');
}

function fillWidth(): string {
  const fill = bar().querySelector<HTMLElement>('.st-progress__bar');
  return fill?.style.width ?? '';
}

describe('Progress', () => {
  it('is a progressbar with an accessible name and value attributes', () => {
    render(<Progress value={3} max={12} label="Lesson progress" />);
    const el = screen.getByRole('progressbar', { name: 'Lesson progress' });
    expect(el.getAttribute('aria-valuenow')).toBe('3');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('12');
    expect(fillWidth()).toBe('25%');
  });

  it('uses 100 as the default max', () => {
    render(<Progress value={40} label="Unit progress" />);
    expect(bar().getAttribute('aria-valuemax')).toBe('100');
    expect(fillWidth()).toBe('40%');
  });

  it.each([
    { name: 'above max', value: 150, now: '100', width: '100%' },
    { name: 'below zero', value: -5, now: '0', width: '0%' },
    { name: 'not a number', value: Number.NaN, now: '0', width: '0%' },
    { name: 'infinite', value: Number.POSITIVE_INFINITY, now: '0', width: '0%' },
  ])('clamps a value that is $name', ({ value, now, width }) => {
    render(<Progress value={value} max={100} label="Progress" />);
    expect(bar().getAttribute('aria-valuenow')).toBe(now);
    expect(fillWidth()).toBe(width);
  });

  it.each([0, -10, Number.NaN])('treats max %s as an empty range', (max) => {
    render(<Progress value={3} max={max} label="Progress" />);
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('0');
    expect(fillWidth()).toBe('0%');
  });

  it('sets aria-valuetext only when valueText is given', () => {
    const { rerender } = render(<Progress value={5} max={12} label="Lesson progress" />);
    expect(bar().hasAttribute('aria-valuetext')).toBe(false);
    rerender(<Progress value={5} max={12} label="Lesson progress" valueText="5 of 12" />);
    expect(bar().getAttribute('aria-valuetext')).toBe('5 of 12');
  });

  it('supports the thin size, a caller class name and a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Progress value={1} max={2} label="Progress" size="sm" className="mine" ref={ref} />);
    expect(bar().className.split(' ')).toEqual(['st-progress', 'st-progress--sm', 'mine']);
    expect(ref.current).toBe(bar());
  });
});
