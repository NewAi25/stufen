// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultipleChoiceExercise } from '../src/index';
import type {
  ExerciseResult,
  MultipleChoiceExerciseProps,
  MultipleChoicePayload,
  MultipleChoiceValue,
} from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: MultipleChoicePayload = {
  question: 'It is 7 pm. What do you say?',
  options: ['Guten Morgen', 'Guten Tag', 'Guten Abend', 'Gute Nacht'],
  answer_index: 2,
};

const WRONG: ExerciseResult = {
  correct: false,
  score: 0,
  feedback: { message: 'Not quite.', expected: 'Guten Abend', explanation: 'Evening greeting.' },
};
const RIGHT: ExerciseResult = { correct: true, score: 1, feedback: { message: 'Correct.' } };

function Host(props: Partial<MultipleChoiceExerciseProps> & { onValue?: (v: unknown) => void }) {
  const [value, setValue] = useState<MultipleChoiceValue | null>(props.value ?? null);
  return (
    <MultipleChoiceExercise
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

function described(el: HTMLElement): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('MultipleChoiceExercise', () => {
  it('shows the instruction, the prompt and one radio per option with lang', () => {
    render(<Host instruction="Choose the right greeting." />);
    expect(screen.getByText('Choose the right greeting.')).toBeTruthy();
    expect(screen.getByText('It is 7 pm. What do you say?')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'It is 7 pm. What do you say?' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    const label = screen.getByText('Guten Abend');
    expect(label.getAttribute('lang')).toBe('de');
  });

  it('reports the selected index on click and on a number key', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Guten Tag' }));
    expect(onValue).toHaveBeenLastCalledWith({ selected: 1 });
    fireEvent.keyDown(document.body, { key: '3' });
    expect(onValue).toHaveBeenLastCalledWith({ selected: 2 });
    expect(screen.getByRole('radio', { name: 'Guten Abend' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('does nothing while disabled', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} disabled />);
    fireEvent.click(screen.getByRole('radio', { name: 'Guten Tag' }));
    fireEvent.keyDown(document.body, { key: '1' });
    expect(onValue).not.toHaveBeenCalled();
  });

  it('marks correct and incorrect in words once there is a result', () => {
    render(<Host value={{ selected: 0 }} result={WRONG} />);
    expect(described(screen.getByRole('radio', { name: 'Guten Morgen' }))).toContain('Not quite');
    expect(described(screen.getByRole('radio', { name: 'Guten Abend' }))).toContain('Correct');
    const feedback = screen.getByRole('alert');
    expect(feedback.textContent).toContain('Not quite.');
    expect(feedback.textContent).toContain('Answer: Guten Abend');
    expect(feedback.textContent).toContain('Evening greeting.');
    expect(feedback.textContent?.match(/Not quite/g)).toHaveLength(1);
  });

  it('is read only after a result', () => {
    const onValue = vi.fn();
    render(<Host value={{ selected: 2 }} result={RIGHT} onValue={onValue} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Guten Tag' }));
    fireEvent.keyDown(document.body, { key: '1' });
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup').getAttribute('aria-readonly')).toBe('true');
  });

  it('still says right or wrong when the payload has no answer key', () => {
    const stripped = { question: PAYLOAD.question, options: PAYLOAD.options };
    const view = render(<Host payload={stripped} value={{ selected: 0 }} result={WRONG} />);
    expect(described(screen.getByRole('radio', { name: 'Guten Morgen' }))).toContain('Not quite');
    view.unmount();
    render(<Host payload={stripped} value={{ selected: 2 }} result={RIGHT} />);
    expect(described(screen.getByRole('radio', { name: 'Guten Abend' }))).toContain('Correct');
  });

  it('takes translated labels and the language of the question', () => {
    render(
      <Host
        value={{ selected: 2 }}
        result={{ correct: true, score: 1, feedback: { message: 'Guten Abend passt.' } }}
        labels={{ correct: 'Richtig' }}
        promptLang="de"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Richtig. Guten Abend passt.');
    expect(screen.getByText('It is 7 pm. What do you say?').getAttribute('lang')).toBe('de');
  });
});
