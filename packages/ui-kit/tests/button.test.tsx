// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../src/index';

afterEach(cleanup);

describe('Button', () => {
  it('renders a native button named by its text, with type button by default', () => {
    render(<Button>Check</Button>);
    const button = screen.getByRole('button', { name: 'Check' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('defaults to the primary variant and md size', () => {
    render(<Button>Check</Button>);
    const classes = screen.getByRole('button').className.split(' ');
    expect(classes).toEqual(['st-button', 'st-button--primary', 'st-button--md']);
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'supports variant %s',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button').classList.contains(`st-button--${variant}`)).toBe(true);
    },
  );

  it.each(['md', 'lg'] as const)('supports size %s', (size) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole('button').classList.contains(`st-button--${size}`)).toBe(true);
  });

  it('keeps a caller class name and a caller type', () => {
    render(
      <Button className="mine" type="submit">
        Send
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button.classList.contains('mine')).toBe(true);
    expect(button.classList.contains('st-button')).toBe(true);
    expect(button.getAttribute('type')).toBe('submit');
  });

  it('forwards the ref to the button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Check</Button>);
    expect(ref.current).toBe(screen.getByRole('button'));
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Check</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is not busy and not disabled by default', () => {
    render(<Button>Check</Button>);
    const button = screen.getByRole<HTMLButtonElement>('button');
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.disabled).toBe(false);
  });

  it('sets aria-busy, disables and ignores clicks while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Grading
      </Button>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Grading' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides the spinner from assistive technology', () => {
    const { container } = render(<Button loading>Grading</Button>);
    const spinner = container.querySelector('.st-button__spinner');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });

  it('disables without aria-busy when only disabled', () => {
    render(<Button disabled>Check</Button>);
    const button = screen.getByRole<HTMLButtonElement>('button');
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
