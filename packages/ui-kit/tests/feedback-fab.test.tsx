// @vitest-environment jsdom
// Acceptance for P0-21: the fab opens a sheet with kind, message and rating fields.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackFab } from '../src/components/FeedbackFab';
import type { FeedbackFabInput, FeedbackFabProps } from '../src/components/FeedbackFab';

// Role queries are slow in jsdom, and slower still while other boxes build on
// the same machine. The default 5 s is too tight for the first test in a file.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

type Submit = FeedbackFabProps['onSubmit'];

/** An onSubmit whose promise the test settles by hand. */
function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const calls: FeedbackFabInput[] = [];
  const onSubmit: Submit = (input) => {
    calls.push(input);
    return new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return {
    calls,
    onSubmit,
    resolve: () => resolve(),
    reject: (reason: unknown) => reject(reason),
  };
}

function resolved(): { calls: FeedbackFabInput[]; onSubmit: Submit } {
  const calls: FeedbackFabInput[] = [];
  return {
    calls,
    onSubmit: (input) => {
      calls.push(input);
      return Promise.resolve();
    },
  };
}

function openSheet(name = 'Give feedback'): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog');
}

function messageBox(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Tell us what happened' });
}

function type(text: string): void {
  fireEvent.change(messageBox(), { target: { value: text } });
}

function send(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

function checkedKind(): string | null {
  const group = screen.getByRole('radiogroup', { name: 'What is it?' });
  const checked = within(group)
    .getAllByRole('radio')
    .find((el) => el.getAttribute('aria-checked') === 'true');
  return checked?.textContent ?? null;
}

describe('FeedbackFab', () => {
  it('acceptance: the fab opens a sheet with kind, message and rating fields', () => {
    render(<FeedbackFab onSubmit={resolved().onSubmit} />);
    const fab = screen.getByRole('button', { name: 'Give feedback' });
    expect(fab.classList.contains('st-feedback-fab')).toBe(true);
    expect(fab.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();

    const dialog = openSheet();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { name: 'Feedback' })).toBeTruthy();
    expect(fab.getAttribute('aria-expanded')).toBe('true');

    const kind = within(dialog).getByRole('radiogroup', { name: 'What is it?' });
    expect(
      within(kind)
        .getAllByRole('radio')
        .map((el) => el.textContent),
    ).toEqual(['Bug', 'Idea', 'Confusing', 'Rating', 'Other']);
    expect(checkedKind()).toBe('Idea');

    expect(messageBox().tagName).toBe('TEXTAREA');
    expect(messageBox().maxLength).toBe(4000);
    expect(within(dialog).getByText('0 / 4000')).toBeTruthy();

    const rating = within(dialog).getByRole('radiogroup', { name: 'How is Stufen so far?' });
    expect(
      within(rating)
        .getAllByRole('radio')
        .map((el) => el.getAttribute('aria-label')),
    ).toEqual(['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']);

    expect(within(dialog).getByRole('button', { name: 'Send' }).getAttribute('type')).toBe(
      'submit',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<FeedbackFab onSubmit={resolved().onSubmit} hidden />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('takes the fab name, the kind words, the strings and the first kind from props', () => {
    render(
      <FeedbackFab
        onSubmit={resolved().onSubmit}
        label="Feedback geben"
        defaultKind="confusing"
        kindLabels={{ bug: 'Fehler', confusing: 'Unklar' }}
        labels={{ title: 'Rückmeldung', submit: 'Senden', message: 'Was ist passiert?' }}
      />,
    );
    const dialog = openSheet('Feedback geben');
    expect(within(dialog).getByRole('heading', { name: 'Rückmeldung' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Fehler' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Idea' })).toBeTruthy();
    expect(checkedKind()).toBe('Unklar');
    expect(within(dialog).getByRole('textbox', { name: 'Was ist passiert?' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Senden' })).toBeTruthy();
  });

  it('moves focus to the selected kind on open and back to the fab on cancel', () => {
    render(<FeedbackFab onSubmit={resolved().onSubmit} />);
    const fab = screen.getByRole('button', { name: 'Give feedback' });
    fab.focus();
    const dialog = openSheet();
    expect(document.activeElement).toBe(within(dialog).getByRole('radio', { name: 'Idea' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(fab);
  });

  it('requires a message unless the kind is rating, and links the error', () => {
    const { calls, onSubmit } = resolved();
    render(<FeedbackFab onSubmit={onSubmit} />);
    openSheet();
    type('   ');
    send();
    expect(calls).toEqual([]);
    const box = messageBox();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(box.required).toBe(true);
    const error = screen.getByText('Write a short message.');
    expect(error.getAttribute('role')).toBe('alert');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(document.activeElement).toBe(box);
    expect(screen.queryByText('Pick a rating.')).toBeNull();

    type('It works.');
    expect(screen.queryByText('Write a short message.')).toBeNull();
    expect(messageBox().hasAttribute('aria-invalid')).toBe(false);
  });

  it('requires a rating when the kind is rating, and links the error', async () => {
    const { calls, onSubmit } = resolved();
    render(<FeedbackFab onSubmit={onSubmit} />);
    openSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Rating' }));
    expect(messageBox().required).toBe(false);
    send();
    expect(calls).toEqual([]);
    const group = screen.getByRole('radiogroup', { name: 'How is Stufen so far?' });
    const error = screen.getByText('Pick a rating.');
    expect(error.getAttribute('role')).toBe('alert');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-required')).toBe('true');
    expect(group.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1 of 5' }));
    expect(screen.queryByText('Write a short message.')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '4 of 5' }));
    expect(screen.queryByText('Pick a rating.')).toBeNull();
    send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toEqual([{ kind: 'rating', message: '', rating: 4 }]);
  });

  it('sends a trimmed message, and the rating only when one is picked', async () => {
    const { calls, onSubmit } = resolved();
    render(<FeedbackFab onSubmit={onSubmit} />);
    openSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Bug' }));
    type('  \n The audio button does nothing. \n ');
    send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toEqual([{ kind: 'bug', message: 'The audio button does nothing.' }]);
    expect(Object.keys(calls[0] ?? {})).toEqual(['kind', 'message']);

    openSheet();
    type(' Nice. ');
    fireEvent.click(screen.getByRole('radio', { name: '5 of 5' }));
    send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls[1]).toEqual({ kind: 'idea', message: 'Nice.', rating: 5 });
  });

  it('shows a loading submit button while pending and ignores a second submit', async () => {
    const pending = deferred();
    render(<FeedbackFab onSubmit={pending.onSubmit} />);
    const dialog = openSheet();
    const form = dialog.querySelector('form');
    if (form === null) throw new Error('no form in the sheet');
    type('Once only.');

    // Two submits in the same tick, before the pending state has rendered.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(pending.calls).toHaveLength(1));
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);

    // And one more after it has rendered.
    fireEvent.submit(form);
    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
    });
    expect(pending.calls).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBeTruthy();

    await act(async () => {
      pending.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(pending.calls).toEqual([{ kind: 'idea', message: 'Once only.' }]);
  });

  it('closes, resets the form and calls onSubmitted on success', async () => {
    const { onSubmit } = resolved();
    const onSubmitted = vi.fn();
    render(<FeedbackFab onSubmit={onSubmit} onSubmitted={onSubmitted} defaultKind="confusing" />);
    const fab = screen.getByRole('button', { name: 'Give feedback' });
    fab.focus();
    openSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    type('Something else.');
    fireEvent.click(screen.getByRole('radio', { name: '2 of 5' }));
    send();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(fab);
    expect(document.body.style.overflow).toBe('');

    const dialog = openSheet();
    expect(checkedKind()).toBe('Confusing');
    expect(messageBox().value).toBe('');
    const rating = within(dialog).getByRole('radiogroup', { name: 'How is Stufen so far?' });
    expect(rating.querySelector('[aria-checked="true"]')).toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('aria-busy')).toBe(false);
  });

  it('stays open with the text intact and shows the error in an alert on failure', async () => {
    const onSubmitted = vi.fn();
    let fail = true;
    const calls: FeedbackFabInput[] = [];
    const onSubmit: Submit = (input) => {
      calls.push(input);
      return fail ? Promise.reject(new Error('The server did not answer.')) : Promise.resolve();
    };
    render(<FeedbackFab onSubmit={onSubmit} onSubmitted={onSubmitted} />);
    const dialog = openSheet();
    type('Keep this text.');
    send();

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe('The server did not answer.');
    expect(alert.classList.contains('st-feedback__error')).toBe(true);
    expect(dialog.querySelector('form')?.getAttribute('aria-describedby')).toBe(alert.id);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(messageBox().value).toBe('Keep this text.');
    expect(onSubmitted).not.toHaveBeenCalled();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' });
    expect(button.disabled).toBe(false);

    // Retry works and clears the alert.
    fail = false;
    send();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toHaveLength(2);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('falls back to the submitFailed words when the rejection has no message', async () => {
    const onSubmit: Submit = () => Promise.reject(new Error(''));
    render(<FeedbackFab onSubmit={onSubmit} labels={{ submitFailed: 'Nicht gesendet.' }} />);
    const dialog = openSheet();
    type('Text');
    send();
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Nicht gesendet.');
  });

  it('shows the alert when onSubmit throws before returning a promise', async () => {
    const onSubmit: Submit = () => {
      throw new Error('Broke early.');
    };
    render(<FeedbackFab onSubmit={onSubmit} />);
    const dialog = openSheet();
    type('Text');
    send();
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Broke early.');
  });

  it('keeps the draft but drops the errors when the sheet is closed and opened again', () => {
    render(<FeedbackFab onSubmit={resolved().onSubmit} />);
    openSheet();
    send();
    expect(screen.getByText('Write a short message.')).toBeTruthy();
    type('Half a thought');
    fireEvent.click(screen.getByRole('radio', { name: 'Bug' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    openSheet();
    expect(messageBox().value).toBe('Half a thought');
    expect(checkedKind()).toBe('Bug');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/** A host that owns the open state and can open the sheet from its own button. */
function Host({
  onSubmit,
  onOpenChange,
  obey = true,
}: {
  onSubmit: Submit;
  onOpenChange?: (open: boolean) => void;
  /** When false the host hears the request and leaves `open` as it is. */
  obey?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Host opens
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Host closes
      </button>
      <FeedbackFab
        onSubmit={onSubmit}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          if (obey) setOpen(next);
        }}
      />
    </>
  );
}

describe('FeedbackFab open state', () => {
  it('lets a parent open the sheet without a click on the fab', () => {
    const onOpenChange = vi.fn();
    render(<Host onSubmit={resolved().onSubmit} onOpenChange={onOpenChange} />);
    const fab = screen.getByRole('button', { name: 'Give feedback' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Host opens' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Feedback' })).toBeTruthy();
    expect(fab.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('radio', { name: 'Idea' }));
    // The parent made the change itself, so there is nothing to report back.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('opens at once when the parent renders it with open true', () => {
    render(<FeedbackFab onSubmit={resolved().onSubmit} open onOpenChange={() => undefined} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Give feedback' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('controlled: stays open until the parent sets open to false', () => {
    const onOpenChange = vi.fn();
    render(<Host onSubmit={resolved().onSubmit} onOpenChange={onOpenChange} obey={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Host opens' }));
    const dialog = screen.getByRole('dialog');

    // Each way of closing asks the parent and changes nothing by itself.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const backdrop = document.querySelector('.st-sheet__backdrop');
    if (backdrop === null) throw new Error('no backdrop');
    fireEvent.click(backdrop);
    expect(onOpenChange.mock.calls).toEqual([[false], [false], [false], [false]]);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(
      screen.getByRole('button', { name: 'Give feedback' }).getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Host closes', hidden: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpenChange).toHaveBeenCalledTimes(4);
  });

  it('controlled: the fab asks to open and the parent decides', () => {
    const onOpenChange = vi.fn();
    render(<Host onSubmit={resolved().onSubmit} onOpenChange={onOpenChange} obey={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Give feedback' }));
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('controlled: a successful submit asks to close, and the errors go when the parent closes', async () => {
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn();
    function Wired() {
      const [open, setOpen] = useState(true);
      return (
        <FeedbackFab
          onSubmit={resolved().onSubmit}
          onSubmitted={onSubmitted}
          open={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
        />
      );
    }
    render(<Wired />);
    send();
    expect(screen.getByText('Write a short message.')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    openSheet();
    expect(screen.queryByText('Write a short message.')).toBeNull();
    type('Works from the host.');
    send();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('uncontrolled: still opens and closes by itself and reports each change', async () => {
    const onOpenChange = vi.fn();
    const onSubmitted = vi.fn();
    render(
      <FeedbackFab
        onSubmit={resolved().onSubmit}
        onSubmitted={onSubmitted}
        onOpenChange={onOpenChange}
      />,
    );
    const fab = screen.getByRole('button', { name: 'Give feedback' });
    expect(onOpenChange).not.toHaveBeenCalled();

    let dialog = openSheet();
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fab.getAttribute('aria-expanded')).toBe('false');

    openSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    dialog = openSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openSheet();
    const backdrop = document.querySelector('.st-sheet__backdrop');
    if (backdrop === null) throw new Error('no backdrop');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();

    openSheet();
    type('Sent from the fab.');
    send();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();

    expect(onOpenChange.mock.calls.map(([next]) => next)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('reports the close before onSubmitted runs', async () => {
    const order: string[] = [];
    render(
      <FeedbackFab
        onSubmit={resolved().onSubmit}
        onSubmitted={() => order.push('submitted')}
        onOpenChange={(next) => order.push(next ? 'open' : 'close')}
      />,
    );
    openSheet();
    type('Order matters.');
    send();
    await waitFor(() => expect(order).toEqual(['open', 'close', 'submitted']));
  });
});
