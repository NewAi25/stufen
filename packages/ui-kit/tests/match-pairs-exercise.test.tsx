// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatchPairsExercise } from '../src/index';
import type {
  ExerciseResult,
  MatchPairsExerciseProps,
  MatchPairsPayload,
  MatchPairsValue,
} from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: MatchPairsPayload = {
  pairs: [
    { left: 'Hallo', right: 'hello' },
    { left: 'Tschüss', right: 'bye' },
    { left: 'Danke', right: 'thank you' },
    { left: 'Bitte', right: 'please' },
  ],
};

function Host(
  props: Partial<MatchPairsExerciseProps> & { onValue?: (v: MatchPairsValue) => void },
) {
  const [value, setValue] = useState<MatchPairsValue | null>(props.value ?? { pairs: [] });
  return (
    <MatchPairsExercise
      payload={PAYLOAD}
      lang="de"
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onValue?.(next);
      }}
    />
  );
}

function column(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

function item(text: string): HTMLElement {
  const el = screen
    .getAllByRole('button')
    .find((button) => button.querySelector('.st-match__text')?.textContent === text);
  if (el === undefined) throw new Error(`no item ${text}`);
  return el;
}

function note(el: HTMLElement): string {
  const id = el.getAttribute('aria-describedby');
  return id === null ? '' : (document.getElementById(id)?.textContent ?? '');
}

function rightTexts(): string[] {
  return within(column('Right column'))
    .getAllByRole('button')
    .map((el) => el.querySelector('.st-match__text')?.textContent ?? '');
}

describe('MatchPairsExercise layout', () => {
  it('shows two named columns with every item as a button', () => {
    render(<Host instruction="Match the words." />);
    expect(screen.getByText('Match the words.')).toBeTruthy();
    const left = within(column('Left column')).getAllByRole('button');
    expect(left.map((el) => el.querySelector('.st-match__text')?.textContent)).toEqual([
      'Hallo',
      'Tschüss',
      'Danke',
      'Bitte',
    ]);
    expect(item('Hallo').querySelector('.st-match__text')?.getAttribute('lang')).toBe('de');
    expect(item('hello').querySelector('.st-match__text')?.getAttribute('lang')).toBeNull();
  });

  it('shuffles the right column, the same way on every render', () => {
    const view = render(<Host />);
    const first = rightTexts();
    expect([...first].sort()).toEqual(['bye', 'hello', 'please', 'thank you']);
    expect(first).not.toEqual(['hello', 'bye', 'thank you', 'please']);
    view.unmount();
    render(<Host />);
    expect(rightTexts()).toEqual(first);
  });
});

describe('MatchPairsExercise pairing', () => {
  it('pairs a left item with a right item on two clicks', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.click(item('Hallo'));
    expect(item('Hallo').getAttribute('aria-pressed')).toBe('true');
    expect(note(item('Hallo'))).toBe('Selected. Now pick its partner.');
    expect(onValue).not.toHaveBeenCalled();
    fireEvent.click(item('hello'));
    expect(onValue).toHaveBeenLastCalledWith({ pairs: [{ left: 'Hallo', right: 'hello' }] });
    expect(item('Hallo').getAttribute('aria-pressed')).toBe('false');
    expect(note(item('Hallo'))).toBe('Paired with hello. Select to undo.');
    expect(note(item('hello'))).toBe('Paired with Hallo. Select to undo.');
    expect(item('Hallo').querySelector('.st-match__partner')?.textContent).toBe('= hello');
  });

  it('also works right item first, and a second pick on one side moves the selection', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.click(item('bye'));
    fireEvent.click(item('please'));
    expect(item('bye').getAttribute('aria-pressed')).toBe('false');
    expect(item('please').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(item('Bitte'));
    expect(onValue).toHaveBeenLastCalledWith({ pairs: [{ left: 'Bitte', right: 'please' }] });
  });

  it('undoes a pair when a paired item is picked again, and with Backspace', () => {
    const onValue = vi.fn();
    render(
      <Host
        onValue={onValue}
        value={{
          pairs: [
            { left: 'Hallo', right: 'hello' },
            { left: 'Danke', right: 'bye' },
          ],
        }}
      />,
    );
    fireEvent.click(item('hello'));
    expect(onValue).toHaveBeenLastCalledWith({ pairs: [{ left: 'Danke', right: 'bye' }] });
    fireEvent.keyDown(item('Danke'), { key: 'Backspace' });
    expect(onValue).toHaveBeenLastCalledWith({ pairs: [] });
    expect(note(item('Danke'))).toBe('');
  });

  it('is fully keyboard operable: arrows move, Enter picks through the native button', () => {
    render(<Host />);
    const left = within(column('Left column')).getAllByRole('button');
    const right = within(column('Right column')).getAllByRole('button');
    // One tab stop per column.
    expect(left.map((el) => el.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(right.map((el) => el.tabIndex)).toEqual([0, -1, -1, -1]);
    left[0]?.focus();
    fireEvent.keyDown(left[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(left[1]);
    expect(left.map((el) => el.tabIndex)).toEqual([-1, 0, -1, -1]);
    fireEvent.keyDown(left[1] as HTMLElement, { key: 'ArrowUp' });
    fireEvent.keyDown(left[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(left[3]);
    fireEvent.keyDown(left[3] as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(left[0]);
    fireEvent.keyDown(left[0] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(left[3]);
    fireEvent.keyDown(left[3] as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(right[3]);
    fireEvent.keyDown(right[3] as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(left[3]);
    for (const el of [...left, ...right]) {
      expect(el.tagName).toBe('BUTTON');
      expect(el.getAttribute('type')).toBe('button');
    }
  });

  it('pairs with a number and then a letter', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    const first = rightTexts()[0] ?? '';
    expect(item('Tschüss').getAttribute('aria-keyshortcuts')).toBe('2');
    expect(item(first).getAttribute('aria-keyshortcuts')).toBe('a');
    item('Hallo').focus();
    fireEvent.keyDown(item('Hallo'), { key: '2' });
    expect(document.activeElement).toBe(item('Tschüss'));
    fireEvent.keyDown(item('Tschüss'), { key: 'a' });
    expect(onValue).toHaveBeenLastCalledWith({ pairs: [{ left: 'Tschüss', right: first }] });
    expect(document.activeElement).toBe(item(first));
  });
});

describe('MatchPairsExercise after a result', () => {
  const VALUE: MatchPairsValue = {
    pairs: [
      { left: 'Hallo', right: 'hello' },
      { left: 'Tschüss', right: 'please' },
      { left: 'Bitte', right: 'bye' },
    ],
  };
  const RESULT: ExerciseResult = {
    correct: false,
    score: 0.25,
    feedback: { message: 'Partly correct. 1 of 4 pairs are right.' },
  };

  it('checks every pair in words and shows the correct partner', () => {
    render(<Host value={VALUE} result={RESULT} />);
    const rows = within(screen.getByRole('list', { name: 'Your pairs' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Hallo = hello ✓ Correct',
      'Tschüss = bye ✗ Not quite You chose please',
      'Danke = thank you ✗ Not quite No partner chosen',
      'Bitte = please ✗ Not quite You chose bye',
    ]);
    expect(screen.getByRole('alert').textContent).toContain('Partly correct.');
  });

  it('locks the items but keeps them focusable', () => {
    const onValue = vi.fn();
    render(<Host value={VALUE} result={RESULT} onValue={onValue} />);
    fireEvent.click(item('Danke'));
    fireEvent.click(item('hello'));
    fireEvent.keyDown(item('Danke'), { key: 'Backspace' });
    fireEvent.keyDown(item('Danke'), { key: '1' });
    expect(onValue).not.toHaveBeenCalled();
    expect(item('Danke').getAttribute('aria-disabled')).toBe('true');
    expect(item('Danke').getAttribute('aria-pressed')).toBe('false');
  });

  it('marks every pair right on a correct result', () => {
    render(
      <Host
        value={{ pairs: PAYLOAD.pairs }}
        result={{ correct: true, score: 1, feedback: { message: 'Correct.' } }}
      />,
    );
    const list = screen.getByRole('list', { name: 'Your pairs' });
    expect(within(list).getAllByText('Correct')).toHaveLength(4);
  });

  it('blocks every change while disabled and takes translated labels', () => {
    const onValue = vi.fn();
    render(<Host disabled onValue={onValue} labels={{ leftColumn: 'Deutsch' }} />);
    expect(column('Deutsch')).toBeTruthy();
    fireEvent.click(item('Hallo'));
    expect(item('Hallo').getAttribute('aria-pressed')).toBe('false');
    expect(onValue).not.toHaveBeenCalled();
  });
});
