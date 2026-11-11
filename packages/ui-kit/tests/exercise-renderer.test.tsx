// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyValue, ExerciseRenderer, isComplete, RENDERABLE_TYPES } from '../src/index';
import type { ExerciseValue } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const QUESTIONS = [
  { question: 'Wo wohnt Max?', options: ['in Wien', 'in Berlin'], answer_index: 1 },
];

const SAMPLES: Record<(typeof RENDERABLE_TYPES)[number], { payload: unknown; find: string }> = {
  multiple_choice: {
    payload: { question: 'Which number comes after sechs?', options: ['vier', 'sieben'] },
    find: 'Which number comes after sechs?',
  },
  cloze: { payload: { text: 'Ich ___ in Berlin.', blanks: [{ answer: 'wohne' }] }, find: 'Ich' },
  match_pairs: {
    payload: {
      pairs: [
        { left: 'eins', right: '1' },
        { left: 'drei', right: '3' },
      ],
    },
    find: 'eins',
  },
  order_words: {
    payload: { words: ['du?', 'Wo', 'wohnst'], answer: 'Wo wohnst du?' },
    find: 'wohnst',
  },
  flashcard: { payload: { front: 'die Stadt', back: 'the city' }, find: 'die Stadt' },
  read_answer: {
    payload: { text: 'Ich heiße Max.', questions: QUESTIONS },
    find: 'Ich heiße Max.',
  },
  listen_answer: {
    payload: { transcript: 'Ich heiße Max.', questions: QUESTIONS },
    find: 'in Wien',
  },
  dictation: { payload: { text: 'Ich wohne auch in Hamburg.' }, find: 'Type what you hear' },
};

function Host({ type, payload }: { type: string; payload: unknown }) {
  const [value, setValue] = useState<ExerciseValue | null>(() => emptyValue(type, payload));
  return (
    <>
      <ExerciseRenderer
        type={type}
        payload={payload}
        value={value}
        onChange={setValue}
        lang="de"
        instruction="Do this."
      />
      <output data-testid="complete">{String(isComplete(type, payload, value))}</output>
    </>
  );
}

describe('ExerciseRenderer', () => {
  it.each([...RENDERABLE_TYPES])('renders the %s renderer', (type) => {
    const sample = SAMPLES[type];
    render(<Host type={type} payload={sample.payload} />);
    expect(document.querySelector(`.st-exercise--${type}`)).toBeTruthy();
    expect(screen.getByText('Do this.')).toBeTruthy();
    expect(screen.getAllByText(sample.find, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('complete').textContent).toBe('false');
  });

  it('passes value and onChange through, so the host can tell when the answer is whole', () => {
    render(<Host type="multiple_choice" payload={SAMPLES.multiple_choice.payload} />);
    fireEvent.click(screen.getByRole('radio', { name: 'sieben' }));
    expect(screen.getByRole('radio', { name: 'sieben' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('complete').textContent).toBe('true');
  });

  it('passes result, labels, disabled and className through', () => {
    render(
      <ExerciseRenderer
        type="cloze"
        payload={SAMPLES.cloze.payload}
        value={{ answers: ['wohne'] }}
        onChange={() => undefined}
        result={{ correct: true, score: 1, feedback: { message: 'Stimmt.' } }}
        labels={{ correct: 'Richtig', blank: (n, total) => `Lücke ${n} von ${total}` }}
        className="mine"
      />,
    );
    expect(document.querySelector('.st-exercise--cloze.mine')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Lücke 1 von 1' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('✓ Richtig. Stimmt.');
  });

  it.each(['translate', 'write_free', 'speak_prompt', 'hologram'])(
    'shows a calm message for the type %s',
    (type) => {
      render(<ExerciseRenderer type={type} payload={{}} value={null} onChange={() => undefined} />);
      expect(screen.getByRole('note').textContent).toBe(
        'This exercise cannot be shown here yet. Skip it to continue.',
      );
    },
  );

  it('shows the same message, and does not throw, for a payload that does not fit', () => {
    const view = render(
      <ExerciseRenderer
        type="cloze"
        payload={{ text: 12 }}
        value={null}
        onChange={() => undefined}
        instruction="Fill the gap."
        labels={{ unsupported: 'Nicht verfügbar.' }}
      />,
    );
    expect(screen.getByRole('note').textContent).toBe('Nicht verfügbar.');
    expect(screen.getByText('Fill the gap.')).toBeTruthy();
    view.rerender(
      <ExerciseRenderer type="read_answer" payload={null} value={7} onChange={() => undefined} />,
    );
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('treats a value of the wrong shape as no answer', () => {
    render(
      <ExerciseRenderer
        type="order_words"
        payload={SAMPLES.order_words.payload}
        value={{ selected: 2 }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Pick the words in order.')).toBeTruthy();
  });
});
