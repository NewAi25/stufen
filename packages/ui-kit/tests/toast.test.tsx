// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../src/index';
import type { ToastApi, ToastProviderProps, ToastTimer } from '../src/index';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A clock the test runs by hand. */
function fakeTimer() {
  let nextHandle = 0;
  const pending = new Map<number, { callback: () => void; ms: number }>();
  const timer: ToastTimer = {
    set(callback, ms) {
      nextHandle += 1;
      pending.set(nextHandle, { callback, ms });
      return nextHandle;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  return {
    timer,
    /** Delays of the timers still waiting. */
    delays: () => [...pending.values()].map((entry) => entry.ms),
    /** Runs every waiting timer, as if its time had passed. */
    runAll() {
      const due = [...pending.entries()];
      pending.clear();
      act(() => {
        for (const [, entry] of due) entry.callback();
      });
    },
  };
}

function setup(props: Omit<ToastProviderProps, 'children'> = {}) {
  const holder: { api: ToastApi | null } = { api: null };
  function Capture() {
    holder.api = useToast();
    return null;
  }
  const view = render(
    <ToastProvider {...props}>
      <Capture />
    </ToastProvider>,
  );
  function api(): ToastApi {
    if (holder.api === null) throw new Error('useToast did not run');
    return holder.api;
  }
  return {
    ...view,
    show(options: Parameters<ToastApi['show']>[0]): string {
      let id = '';
      act(() => {
        id = api().show(options);
      });
      return id;
    },
    dismiss(id: string): void {
      act(() => api().dismiss(id));
    },
  };
}

function polite(): HTMLElement {
  return screen.getByRole('status');
}

function assertive(): HTMLElement {
  return screen.getByRole('alert');
}

describe('Toast live regions', () => {
  it('has a polite and an assertive region before any toast is shown', () => {
    setup();
    expect(polite().getAttribute('aria-live')).toBe('polite');
    expect(assertive().getAttribute('aria-live')).toBe('assertive');
    expect(polite().textContent).toBe('');
    expect(assertive().textContent).toBe('');
  });

  it('puts info and success toasts in the polite region', () => {
    const { show } = setup();
    show({ message: 'Saved.' });
    show({ message: 'Sent. Thank you.', tone: 'success' });
    expect(within(polite()).getByText('Saved.')).toBeTruthy();
    expect(within(polite()).getByText('Sent. Thank you.')).toBeTruthy();
    expect(assertive().textContent).toBe('');
  });

  it('puts error toasts in the assertive region', () => {
    const { show } = setup();
    show({ message: 'That reply did not send. Try again.', tone: 'error' });
    expect(within(assertive()).getByText('That reply did not send. Try again.')).toBeTruthy();
    expect(polite().textContent).toBe('');
  });

  it('marks each toast with its tone and hides the icon from assistive technology', () => {
    const { show, container } = setup();
    show({ message: 'One' });
    show({ message: 'Two', tone: 'success' });
    show({ message: 'Three', tone: 'error' });
    const classes = [...container.querySelectorAll('.st-toast')].map((el) => el.className);
    expect(classes).toEqual([
      'st-toast st-toast--info',
      'st-toast st-toast--success',
      'st-toast st-toast--error',
    ]);
    const icons = [...container.querySelectorAll('.st-toast__icon')];
    expect(icons).toHaveLength(3);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});

describe('Toast dismiss button', () => {
  it('has an accessible name and removes its toast', () => {
    const { show } = setup();
    show({ message: 'Saved.' });
    show({ message: 'Also saved.' });
    const buttons = screen.getAllByRole('button', { name: 'Dismiss' });
    expect(buttons).toHaveLength(2);
    const first = buttons[0];
    if (first === undefined) throw new Error('No dismiss button');
    expect(first.getAttribute('type')).toBe('button');
    fireEvent.click(first);
    expect(screen.queryByText('Saved.')).toBeNull();
    expect(screen.getByText('Also saved.')).toBeTruthy();
  });

  it('takes a translated name from the provider', () => {
    const { show } = setup({ dismissLabel: 'Schließen' });
    show({ message: 'Gespeichert.' });
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeTruthy();
  });
});

describe('Toast auto dismiss', () => {
  it('leaves after the default 5000 ms', () => {
    const clock = fakeTimer();
    const { show } = setup({ timer: clock.timer });
    show({ message: 'Saved.' });
    expect(clock.delays()).toEqual([5000]);
    expect(screen.getByText('Saved.')).toBeTruthy();
    clock.runAll();
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('uses durationMs from show, then the provider default', () => {
    const clock = fakeTimer();
    const { show } = setup({ timer: clock.timer, defaultDurationMs: 3000 });
    show({ message: 'One' });
    show({ message: 'Two', durationMs: 8000 });
    expect(clock.delays()).toEqual([3000, 8000]);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY])(
    'stays until dismissed when durationMs is %s',
    (ms) => {
      const clock = fakeTimer();
      const { show } = setup({ timer: clock.timer });
      show({ message: 'Sticky', durationMs: ms });
      expect(clock.delays()).toEqual([]);
      expect(screen.getByText('Sticky')).toBeTruthy();
    },
  );

  it('cancels the timer when the toast is dismissed by hand', () => {
    const clock = fakeTimer();
    const { show } = setup({ timer: clock.timer });
    show({ message: 'Saved.' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(clock.delays()).toEqual([]);
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('cancels every timer when the provider unmounts', () => {
    const clock = fakeTimer();
    const { show, unmount } = setup({ timer: clock.timer });
    show({ message: 'One' });
    show({ message: 'Two' });
    expect(clock.delays()).toHaveLength(2);
    unmount();
    expect(clock.delays()).toEqual([]);
  });

  it('uses the real clock when no timer is injected', () => {
    vi.useFakeTimers();
    const { show } = setup();
    show({ message: 'Saved.', durationMs: 1000 });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('Saved.')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Saved.')).toBeNull();
  });
});

describe('useToast', () => {
  it('returns an id from show that dismiss accepts', () => {
    const clock = fakeTimer();
    const { show, dismiss } = setup({ timer: clock.timer });
    const first = show({ message: 'One' });
    const second = show({ message: 'Two' });
    expect(first).not.toBe(second);
    dismiss(first);
    expect(screen.queryByText('One')).toBeNull();
    expect(screen.getByText('Two')).toBeTruthy();
    expect(clock.delays()).toHaveLength(1);
  });

  it('ignores an unknown id', () => {
    const { show, dismiss } = setup();
    show({ message: 'One' });
    dismiss('nope');
    expect(screen.getByText('One')).toBeTruthy();
  });

  it('works from a click handler in a child component', () => {
    function SaveButton() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.show({ message: 'Saved.', tone: 'success' })}>
          Save
        </button>
      );
    }
    render(
      <ToastProvider>
        <SaveButton />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(within(polite()).getByText('Saved.')).toBeTruthy();
  });

  it('throws a clear error outside a ToastProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow('useToast must be used inside a ToastProvider.');
  });
});
