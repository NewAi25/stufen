// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../src/components/Sheet';
import type { SheetProps } from '../src/components/Sheet';

// Role queries are slow in jsdom, and slower still while other boxes build on
// the same machine. The default 5 s is too tight for the first test in a file.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function Harness(props: Partial<SheetProps> & { focusSecond?: boolean }) {
  const { focusSecond = false, ...sheetProps } = props;
  const [open, setOpen] = useState(false);
  const secondRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div data-theme="dark" data-motion="reduce">
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="More"
        initialFocusRef={focusSecond ? secondRef : undefined}
        {...sheetProps}
      >
        <button type="button">First</button>
        <button type="button" ref={secondRef}>
          Second
        </button>
        <button type="button" disabled>
          Off
        </button>
        <button type="button" tabIndex={-1}>
          Skipped
        </button>
      </Sheet>
    </div>
  );
}

function openSheet(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return screen.getByRole('dialog');
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Sheet open={false} onClose={() => undefined} title="More">
        <p>Body</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Body')).toBeNull();
    expect(container.innerHTML).toBe('');
    expect(document.querySelector('.st-sheet')).toBeNull();
  });

  it('is a modal dialog named by its title', () => {
    render(<Harness />);
    const dialog = openSheet();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = screen.getByRole('heading', { name: 'More', level: 2 });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(screen.getByRole('dialog', { name: 'More' })).toBe(dialog);
    expect(dialog.hasAttribute('aria-describedby')).toBe(false);
  });

  it('links the description with aria-describedby', () => {
    render(<Harness description="Pick where to go." />);
    const dialog = openSheet();
    const description = screen.getByText('Pick where to go.');
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('is portalled to the body and carries the side, theme and motion of its origin', () => {
    const { container } = render(<Harness side="right" />);
    const dialog = openSheet();
    expect(container.contains(dialog)).toBe(false);
    const root = dialog.parentElement;
    expect(root?.parentElement).toBe(document.body);
    expect(root?.className.split(' ')).toEqual(['st-sheet', 'st-sheet--right']);
    expect(root?.getAttribute('data-theme')).toBe('dark');
    expect(root?.getAttribute('data-motion')).toBe('reduce');
  });

  it('sits at the bottom by default', () => {
    render(<Harness />);
    expect(openSheet().parentElement?.classList.contains('st-sheet--bottom')).toBe(true);
  });

  it('moves focus to the first focusable element on open', () => {
    render(<Harness />);
    openSheet();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('moves focus to initialFocusRef when given', () => {
    render(<Harness focusSecond />);
    openSheet();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second' }));
  });

  it('wraps Tab from the last focusable element to the first', () => {
    render(<Harness />);
    openSheet();
    const close = screen.getByRole('button', { name: 'Close' });
    const second = screen.getByRole('button', { name: 'Second' });
    second.focus();
    const notPrevented = fireEvent.keyDown(second, { key: 'Tab' });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(close);
  });

  it('wraps Shift Tab from the first focusable element to the last', () => {
    render(<Harness />);
    openSheet();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
    const notPrevented = fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second' }));
  });

  it('leaves Tab alone in the middle of the sheet', () => {
    render(<Harness />);
    openSheet();
    const first = screen.getByRole('button', { name: 'First' });
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('pulls focus back in when Tab is pressed outside the sheet', () => {
    render(<Harness />);
    openSheet();
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.keyDown(opener, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="More">
        <button type="button">First</button>
      </Sheet>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="More">
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByText('Body'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = document.querySelector('.st-sheet__backdrop');
    expect(backdrop).not.toBeNull();
    if (backdrop !== null) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has a visible close button with an accessible name', () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="More" closeLabel="Schließen" />);
    const close = screen.getByRole('button', { name: 'Schließen' });
    expect(close.classList.contains('st-sheet__close')).toBe(true);
    expect(close.getAttribute('type')).toBe('button');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the element that had it when the sheet closes', () => {
    render(<Harness />);
    openSheet();
    const opener = screen.getByRole('button', { name: 'Open' });
    expect(document.activeElement).not.toBe(opener);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('locks body scroll while open and restores the old value on close', () => {
    document.body.style.overflow = 'scroll';
    render(<Harness />);
    expect(document.body.style.overflow).toBe('scroll');
    openSheet();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores body scroll when unmounted while open', () => {
    const { unmount } = render(<Sheet open onClose={() => undefined} title="More" />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps focus inside a sheet that has no children', () => {
    render(<Sheet open onClose={() => undefined} title="More" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});
