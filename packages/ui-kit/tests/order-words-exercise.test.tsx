// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderWordsExercise } from '../src/index';
import type { OrderWordsExerciseProps, OrderWordsPayload, OrderWordsValue } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: OrderWordsPayload = {
  words: ['heiße', 'Maria.', 'Ich'],
  answer: 'Ich heiße Maria.',
};

function Host(
  props: Partial<OrderWordsExerciseProps> & { onValue?: (v: OrderWordsValue) => void },
) {
  const [value, setValue] = useState<OrderWordsValue | null>(props.value ?? { order: [] });
  return (
    <OrderWordsExercise
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

function zone(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

function wordsIn(name: string): string[] {
  return within(zone(name))
    .queryAllByRole('button')
    .map((el) => el.querySelector('[lang]')?.textContent ?? '');
}

function word(name: string, text: string): HTMLElement {
  const el = within(zone(name))
    .getAllByRole('button')
    .find((button) => button.querySelector('[lang]')?.textContent === text);
  if (el === undefined) throw new Error(`no word ${text} in ${name}`);
  return el;
}

describe('OrderWordsExercise', () => {
  it('starts with every word in the bank and an empty line', () => {
    render(<Host instruction="Put the words in the right order." />);
    expect(screen.getByText('Put the words in the right order.')).toBeTruthy();
    expect(wordsIn('Word bank')).toEqual(['heiße', 'Maria.', 'Ich']);
    expect(wordsIn('Your sentence')).toEqual([]);
    expect(within(zone('Your sentence')).getByText('Pick the words in order.')).toBeTruthy();
    expect(word('Word bank', 'Ich').querySelector('[lang]')?.getAttribute('lang')).toBe('de');
  });

  it('moves a word to the line on click and back on a second click', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.click(word('Word bank', 'Ich'));
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich'] });
    expect(wordsIn('Your sentence')).toEqual(['Ich']);
    expect(wordsIn('Word bank')).toEqual(['heiße', 'Maria.']);
    fireEvent.click(word('Your sentence', 'Ich'));
    expect(onValue).toHaveBeenLastCalledWith({ order: [] });
    expect(wordsIn('Word bank')).toEqual(['heiße', 'Maria.', 'Ich']);
  });

  it('uses native buttons, so Enter picks, and keeps focus on a sensible word', () => {
    render(<Host />);
    const ich = word('Word bank', 'Ich');
    expect(ich.tagName).toBe('BUTTON');
    ich.focus();
    fireEvent.click(ich);
    // The neighbour in the bank takes focus, so the next pick is one key away.
    expect(document.activeElement).toBe(word('Word bank', 'Maria.'));
    fireEvent.click(word('Word bank', 'Maria.'));
    fireEvent.click(word('Word bank', 'heiße'));
    // The bank is empty: focus follows the word into the line.
    expect(document.activeElement).toBe(word('Your sentence', 'heiße'));
  });

  it('reorders a focused word in the line with the arrow keys', () => {
    const onValue = vi.fn();
    render(<Host value={{ order: ['Ich', 'Maria.', 'heiße'] }} onValue={onValue} />);
    const heisse = word('Your sentence', 'heiße');
    heisse.focus();
    expect(heisse.textContent).toBe('heiße, position 3 of 3');
    fireEvent.keyDown(heisse, { key: 'ArrowLeft' });
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich', 'heiße', 'Maria.'] });
    expect(document.activeElement).toBe(word('Your sentence', 'heiße'));
    expect(screen.getByRole('status').textContent).toBe('heiße, position 2 of 3');
    fireEvent.keyDown(word('Your sentence', 'heiße'), { key: 'ArrowRight' });
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich', 'Maria.', 'heiße'] });
    onValue.mockClear();
    fireEvent.keyDown(word('Your sentence', 'heiße'), { key: 'ArrowRight' });
    expect(onValue).not.toHaveBeenCalled();
  });

  it('appends the nth bank word on a number key and takes the last back on Backspace', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    word('Word bank', 'heiße').focus();
    fireEvent.keyDown(word('Word bank', 'heiße'), { key: '3' });
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich'] });
    fireEvent.keyDown(word('Word bank', 'heiße'), { key: '1' });
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich', 'heiße'] });
    fireEvent.keyDown(word('Word bank', 'Maria.'), { key: 'Backspace' });
    expect(onValue).toHaveBeenLastCalledWith({ order: ['Ich'] });
  });

  it('keeps two equal words apart', () => {
    const onValue = vi.fn();
    render(<Host payload={{ words: ['die', 'Frau', 'die'] }} onValue={onValue} />);
    fireEvent.click(within(zone('Word bank')).getAllByRole('button')[2] as HTMLElement);
    expect(wordsIn('Word bank')).toEqual(['Frau', 'die']);
    fireEvent.click(word('Word bank', 'die'));
    expect(onValue).toHaveBeenLastCalledWith({ order: ['die', 'die'] });
    expect(wordsIn('Word bank')).toEqual(['Frau']);
  });
});

describe('OrderWordsExercise after a result', () => {
  it('shows the correct sentence with the first differing word underlined', () => {
    render(
      <Host
        value={{ order: ['Ich', 'Maria.', 'heiße'] }}
        result={{
          correct: false,
          score: 0,
          feedback: { message: 'Not quite.', expected: 'Ich heiße Maria.' },
        }}
      />,
    );
    const expected = document.querySelector('.st-order__expected');
    expect(expected?.textContent).toBe('Correct order: Ich (first difference) heiße Maria.');
    expect(expected?.querySelector('u')?.textContent).toBe('heiße');
    expect(expected?.querySelector('[lang="de"]')).toBeTruthy();
    // The feedback does not repeat the sentence.
    expect(screen.getByRole('alert').textContent).toBe('✗ Not quite.');
  });

  it('shows no correct sentence on a correct result and locks the words', () => {
    const onValue = vi.fn();
    render(
      <Host
        value={{ order: ['Ich', 'heiße', 'Maria.'] }}
        onValue={onValue}
        result={{ correct: true, score: 1, feedback: { message: 'Correct.' } }}
      />,
    );
    expect(document.querySelector('.st-order__expected')).toBeNull();
    fireEvent.click(word('Your sentence', 'Ich'));
    fireEvent.keyDown(word('Your sentence', 'Ich'), { key: 'ArrowRight' });
    fireEvent.keyDown(word('Your sentence', 'Ich'), { key: 'Backspace' });
    expect(onValue).not.toHaveBeenCalled();
    expect(word('Your sentence', 'Ich').getAttribute('aria-disabled')).toBe('true');
  });

  it('falls back to the expected text of the feedback when the payload has no answer', () => {
    render(
      <Host
        payload={{ words: PAYLOAD.words }}
        value={{ order: ['heiße', 'Ich', 'Maria.'] }}
        result={{
          correct: false,
          score: 0,
          feedback: { message: 'Not quite.', expected: 'Ich heiße Maria.' },
        }}
      />,
    );
    expect(document.querySelector('.st-order__expected u')?.textContent).toBe('Ich');
  });

  it('blocks every change while disabled and takes translated labels', () => {
    const onValue = vi.fn();
    render(<Host disabled onValue={onValue} labels={{ bank: 'Wörter', line: 'Dein Satz' }} />);
    fireEvent.click(word('Wörter', 'Ich'));
    fireEvent.keyDown(word('Wörter', 'Ich'), { key: '1' });
    expect(onValue).not.toHaveBeenCalled();
    expect(zone('Dein Satz')).toBeTruthy();
  });
});
