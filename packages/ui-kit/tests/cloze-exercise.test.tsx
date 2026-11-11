// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClozeExercise } from '../src/index';
import type { ClozeExerciseProps, ClozePayload, ClozeValue, ExerciseResult } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: ClozePayload = {
  text: 'Ich ___ Anna. Du ___ Tom. Das ___ Frau Müller.',
  blanks: [
    { answer: 'bin', hint: 'sein, ich' },
    { answer: 'bist', hint: 'sein, du' },
    { answer: 'ist', accept: ['IST'] },
  ],
};

const PARTLY: ExerciseResult = {
  correct: false,
  score: 0.6667,
  feedback: { message: 'Partly correct. Blank 2 is "bist".', expected: 'Ich bin Anna.' },
};

function Host(props: Partial<ClozeExerciseProps> & { onValue?: (v: ClozeValue) => void }) {
  const [value, setValue] = useState<ClozeValue | null>(props.value ?? null);
  return (
    <ClozeExercise
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

function blanks(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>('textbox');
}

function blank(index: number): HTMLInputElement {
  const el = blanks()[index];
  if (el === undefined) throw new Error(`no blank ${index}`);
  return el;
}

function described(el: HTMLElement): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ');
}

describe('ClozeExercise', () => {
  it('renders the sentence with one input per three underscore gap', () => {
    render(<Host instruction="Fill in the correct form of sein." />);
    expect(screen.getByText('Fill in the correct form of sein.')).toBeTruthy();
    const text = document.querySelector('.st-cloze__text');
    expect(text?.getAttribute('lang')).toBe('de');
    expect(text?.textContent).toContain('Ich ');
    expect(text?.textContent).toContain(' Frau Müller.');
    expect(text?.textContent).not.toContain('___');
    expect(blanks()).toHaveLength(3);
  });

  it('labels each input "Blank n of N" and links its hint', () => {
    render(<Host />);
    expect(screen.getByRole('textbox', { name: 'Blank 1 of 3' })).toBe(blank(0));
    expect(screen.getByRole('textbox', { name: 'Blank 3 of 3' })).toBe(blank(2));
    expect(described(blank(0))).toBe('sein, ich');
    expect(blank(2).getAttribute('aria-describedby')).toBeNull();
  });

  it('keeps the inputs in the tab order, in the order of the gaps', () => {
    render(<Host />);
    expect(blanks().map((el) => el.tabIndex)).toEqual([0, 0, 0]);
    const order = [...document.querySelectorAll('input')];
    expect(order).toEqual(blanks());
  });

  it('reports one answer per blank, in order', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.change(blank(1), { target: { value: 'bist' } });
    expect(onValue).toHaveBeenLastCalledWith({ answers: ['', 'bist', ''] });
    fireEvent.change(blank(0), { target: { value: 'bin' } });
    expect(onValue).toHaveBeenLastCalledWith({ answers: ['bin', 'bist', ''] });
    expect(blank(0).value).toBe('bin');
  });

  it('marks each gap on its own after a result: right, or the expected answer', () => {
    render(<Host value={{ answers: ['Bin ', 'bin', 'ist'] }} result={PARTLY} />);
    expect(described(blank(0))).toContain('Correct');
    expect(blank(0).getAttribute('aria-invalid')).toBeNull();
    expect(described(blank(1))).toContain('Not quite');
    expect(described(blank(1))).toContain('bist');
    expect(blank(1).getAttribute('aria-invalid')).toBe('true');
    expect(described(blank(2))).toContain('Correct');
    expect(document.querySelector('.st-cloze__expected')?.getAttribute('lang')).toBe('de');
    // The solved sentence is not repeated in the feedback, the gaps already show it.
    expect(screen.getByRole('alert').textContent).not.toContain('Answer:');
  });

  it('is read only after a result and blocked while disabled', () => {
    const onValue = vi.fn();
    const view = render(
      <Host value={{ answers: ['a', 'b', 'c'] }} result={PARTLY} onValue={onValue} />,
    );
    expect(blank(0).readOnly).toBe(true);
    fireEvent.change(blank(0), { target: { value: 'x' } });
    expect(onValue).not.toHaveBeenCalled();
    view.unmount();
    render(<Host disabled onValue={onValue} />);
    expect(blank(0).disabled).toBe(true);
  });

  it('marks every gap right on a correct result, also without answer keys', () => {
    const stripped: ClozePayload = { text: 'Ich ___ in Berlin.', blanks: [{ hint: 'wohnen' }] };
    const view = render(
      <Host
        payload={stripped}
        value={{ answers: ['wohne'] }}
        result={{ correct: true, score: 1, feedback: { message: 'Correct.' } }}
      />,
    );
    expect(described(blank(0))).toContain('Correct');
    view.unmount();
    render(
      <Host
        payload={stripped}
        value={{ answers: ['wohnt'] }}
        result={{
          correct: false,
          score: 0,
          feedback: { message: 'Not quite.', expected: 'Ich wohne in Berlin.' },
        }}
      />,
    );
    // Without a key the gap is not judged. The feedback carries the answer.
    expect(described(blank(0))).toBe('wohnen');
    expect(screen.getByRole('alert').textContent).toContain('Answer: Ich wohne in Berlin.');
  });

  it('takes a translated blank label', () => {
    render(<Host labels={{ blank: (n, total) => `Lücke ${n} von ${total}` }} />);
    expect(screen.getByRole('textbox', { name: 'Lücke 2 von 3' })).toBeTruthy();
  });
});
