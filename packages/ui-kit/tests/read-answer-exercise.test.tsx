// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadAnswerExercise } from '../src/index';
import type {
  ExerciseResult,
  QuestionsValue,
  ReadAnswerExerciseProps,
  ReadAnswerPayload,
} from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: ReadAnswerPayload = {
  text: 'Guten Tag! Ich heiße Lena Fischer. Ich komme aus Deutschland.',
  questions: [
    {
      question: 'Woher kommt Lena?',
      options: ['aus Österreich', 'aus Deutschland', 'aus England'],
      answer_index: 1,
      explanation_en: 'She says: Ich komme aus Deutschland.',
    },
    { question: 'Wie heißt sie?', options: ['Lena', 'Lea'], answer_index: 0 },
    { question: 'Wie ist ihr Nachname?' },
  ],
};

const PARTLY: ExerciseResult = {
  correct: false,
  score: 0.3333,
  feedback: { message: 'Partly correct. 1 of 3 answers are right.' },
};

function Host(props: Partial<ReadAnswerExerciseProps> & { onValue?: (v: QuestionsValue) => void }) {
  const [value, setValue] = useState<QuestionsValue | null>(props.value ?? null);
  return (
    <ReadAnswerExercise
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

describe('ReadAnswerExercise', () => {
  it('shows the passage with lang, then every question', () => {
    render(<Host instruction="Read the text and answer." promptLang="de" />);
    expect(screen.getByText('Read the text and answer.')).toBeTruthy();
    const passage = screen.getByRole('region', { name: 'Text' });
    expect(passage.getAttribute('lang')).toBe('de');
    expect(passage.textContent).toContain('Ich heiße Lena Fischer.');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Question 1 of 3')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Woher kommt Lena?' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Wie heißt sie?' })).toBeTruthy();
    const typed = screen.getByRole('textbox', { name: 'Wie ist ihr Nachname?' });
    expect(typed.getAttribute('lang')).toBe('de');
    // The passage comes before the questions in the document.
    const list = screen.getByRole('list');
    expect(passage.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const prompt = within(list).getAllByText('Woher kommt Lena?')[0];
    expect(prompt?.getAttribute('lang')).toBe('de');
  });

  it('uses the title as a heading and as the name of the passage, and splits paragraphs', () => {
    render(<Host payload={{ ...PAYLOAD, title: 'Lena', text: 'Eins.\n\nZwei.' }} />);
    const passage = screen.getByRole('region', { name: 'Lena' });
    expect(within(passage).getByRole('heading', { name: 'Lena' })).toBeTruthy();
    expect(passage.querySelectorAll('.st-passage__text')).toHaveLength(2);
  });

  it('reports one answer per question: an option index or a short text', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.click(screen.getByRole('radio', { name: 'aus Deutschland' }));
    expect(onValue).toHaveBeenLastCalledWith({ answers: [1, '', ''] });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fischer' } });
    expect(onValue).toHaveBeenLastCalledWith({ answers: [1, '', 'Fischer'] });
    fireEvent.click(screen.getByRole('radio', { name: 'Lena' }));
    expect(onValue).toHaveBeenLastCalledWith({ answers: [1, 0, 'Fischer'] });
  });

  it('picks an option of the focused question with a number key, and typing a digit is not a pick', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    const lea = screen.getByRole('radio', { name: 'Lea' });
    lea.focus();
    fireEvent.keyDown(lea, { key: '2' });
    expect(onValue).toHaveBeenLastCalledWith({ answers: ['', 1, ''] });
    fireEvent.keyDown(lea, { key: '3' });
    expect(onValue).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '1' });
    expect(onValue).toHaveBeenCalledTimes(1);
  });

  it('corrects each question in place after a result', () => {
    render(<Host value={{ answers: [0, 0, 'Fisher'] }} result={PARTLY} />);
    expect(described(screen.getByRole('radio', { name: 'aus Österreich' }))).toContain('Not quite');
    expect(described(screen.getByRole('radio', { name: 'aus Deutschland' }))).toContain('Correct');
    expect(described(screen.getByRole('radio', { name: 'Lena' }))).toContain('Correct');
    expect(screen.getByText('She says: Ich komme aus Deutschland.')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox').readOnly).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Partly correct.');
  });

  it('is read only after a result and blocked while disabled', () => {
    const onValue = vi.fn();
    const view = render(
      <Host value={{ answers: [0, 0, 'x'] }} result={PARTLY} onValue={onValue} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'aus England' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'y' } });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Lea' }), { key: '2' });
    expect(onValue).not.toHaveBeenCalled();
    view.unmount();
    render(<Host disabled onValue={onValue} />);
    fireEvent.click(screen.getByRole('radio', { name: 'aus England' }));
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
  });

  it('takes translated labels', () => {
    render(
      <Host labels={{ question: (n, total) => `Frage ${n} von ${total}`, passage: 'Lesetext' }} />,
    );
    expect(screen.getByText('Frage 2 von 3')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Lesetext' })).toBeTruthy();
  });
});
