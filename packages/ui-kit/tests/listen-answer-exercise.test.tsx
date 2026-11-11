// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListenAnswerExercise } from '../src/index';
import type {
  ExerciseResult,
  ListenAnswerExerciseProps,
  ListenAnswerPayload,
  QuestionsValue,
} from '../src/index';

vi.setConfig({ testTimeout: 20_000 });

class FakeUtterance {
  lang = '';
  rate = 1;
  constructor(public text: string) {}
}
const speak = vi.fn<(utterance: FakeUtterance) => void>();

beforeEach(() => {
  speak.mockClear();
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak, cancel: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
});

const TRANSCRIPT = 'Hallo! Ich heiße Anna. Ich komme aus Österreich.';
const PAYLOAD: ListenAnswerPayload = {
  transcript: TRANSCRIPT,
  questions: [
    {
      question: 'Woher kommt Anna?',
      options: ['aus Deutschland', 'aus Österreich', 'aus der Schweiz'],
      answer_index: 1,
    },
    { question: 'Wie heißt sie?', options: ['Anna', 'Anne', 'Hanna'], answer_index: 0 },
  ],
};
const RIGHT: ExerciseResult = { correct: true, score: 1, feedback: { message: 'Correct.' } };

function Host(
  props: Partial<ListenAnswerExerciseProps> & { onValue?: (v: QuestionsValue) => void },
) {
  const [value, setValue] = useState<QuestionsValue | null>(props.value ?? null);
  return (
    <ListenAnswerExercise
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

describe('ListenAnswerExercise', () => {
  it('speaks the transcript through speech synthesis when the payload has no file', () => {
    render(<Host instruction="Listen. Then answer the two questions." />);
    expect(screen.getByText('Listen. Then answer the two questions.')).toBeTruthy();
    expect(document.querySelector('audio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0].text).toBe(TRANSCRIPT);
    expect(speak.mock.calls[0]?.[0].lang).toBe('de');
  });

  it('plays the file through an audio element when the payload has one', () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<Host payload={{ ...PAYLOAD, audio: '/audio/anna.mp3' }} />);
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('/audio/anna.mp3');
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
  });

  it('plays on Space from the page', () => {
    render(<Host />);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('keeps the transcript out of the page before the answer', () => {
    render(<Host value={{ answers: [1, 0] }} />);
    expect(document.body.textContent).not.toContain('Ich heiße Anna');
    expect(screen.queryByRole('button', { name: 'Show transcript' })).toBeNull();
  });

  it('offers the transcript after the answer, with lang', () => {
    render(<Host value={{ answers: [1, 0] }} result={RIGHT} />);
    const toggle = screen.getByRole('button', { name: 'Show transcript' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent).not.toContain('Ich heiße Anna');
    fireEvent.click(toggle);
    const text = screen.getByText(TRANSCRIPT);
    expect(text.getAttribute('lang')).toBe('de');
    const open = screen.getByRole('button', { name: 'Hide transcript' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(open.getAttribute('aria-controls') ?? '')?.contains(text)).toBe(
      true,
    );
    fireEvent.click(open);
    expect(screen.queryByText(TRANSCRIPT)).toBeNull();
  });

  it('asks the questions and reports one answer per question', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    fireEvent.click(screen.getByRole('radio', { name: 'aus Österreich' }));
    expect(onValue).toHaveBeenLastCalledWith({ answers: [1, ''] });
    fireEvent.click(screen.getByRole('radio', { name: 'Hanna' }));
    expect(onValue).toHaveBeenLastCalledWith({ answers: [1, 2] });
  });

  it('disables the audio and the questions while disabled', () => {
    const onValue = vi.fn();
    render(<Host disabled onValue={onValue} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Play audio' }).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Anna' }));
    expect(onValue).not.toHaveBeenCalled();
  });
});
