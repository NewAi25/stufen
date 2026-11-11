// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictationExercise } from '../src/index';
import type { DictationExerciseProps, DictationPayload, DictationValue } from '../src/index';

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

const PAYLOAD: DictationPayload = { text: 'Guten Tag, ich heiße Peter.' };

function Host(props: Partial<DictationExerciseProps> & { onValue?: (v: DictationValue) => void }) {
  const [value, setValue] = useState<DictationValue | null>(props.value ?? { text: '' });
  return (
    <DictationExercise
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

function area(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Type what you hear' });
}

/** Play, then stop, so the next click plays again. */
function playOnce(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));
}

describe('DictationExercise', () => {
  it('shows an audio button, a text area with lang and a replay counter, but not the text', () => {
    render(<Host instruction="Listen and type what you hear." />);
    expect(screen.getByText('Listen and type what you hear.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeTruthy();
    expect(area().tagName).toBe('TEXTAREA');
    expect(area().getAttribute('lang')).toBe('de');
    expect(screen.getByRole('status').textContent).toBe('Not played yet');
    expect(document.body.textContent).not.toContain('Peter');
  });

  it('speaks the text when there is no file and counts the replays in the value', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    playOnce();
    expect(speak.mock.calls[0]?.[0].text).toBe('Guten Tag, ich heiße Peter.');
    expect(speak.mock.calls[0]?.[0].lang).toBe('de');
    expect(onValue).toHaveBeenLastCalledWith({ text: '', replays: 0 });
    expect(screen.getByRole('status').textContent).toBe('Played 1 time');
    playOnce();
    playOnce();
    expect(onValue).toHaveBeenLastCalledWith({ text: '', replays: 2 });
    expect(screen.getByRole('status').textContent).toBe('Played 3 times');
  });

  it('reports the typed text and keeps the replay count with it', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.change(area(), { target: { value: 'Guten' } });
    expect(onValue).toHaveBeenLastCalledWith({ text: 'Guten' });
    playOnce();
    playOnce();
    fireEvent.change(area(), { target: { value: 'Guten Tag' } });
    expect(onValue).toHaveBeenLastCalledWith({ text: 'Guten Tag', replays: 1 });
    expect(area().value).toBe('Guten Tag');
  });

  it('plays on Space while the box is empty, and on Ctrl plus Space once there is text', () => {
    render(<Host />);
    fireEvent.keyDown(area(), { key: ' ' });
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));
    fireEvent.change(area(), { target: { value: 'Guten' } });
    fireEvent.keyDown(area(), { key: ' ' });
    expect(speak).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(area(), { key: ' ', ctrlKey: true });
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('reveals the transcript after a result and makes the text read only', () => {
    const onValue = vi.fn();
    render(
      <Host
        value={{ text: 'Guten Tag ich heisse Peter', replays: 1 }}
        onValue={onValue}
        result={{
          correct: false,
          score: 0.8,
          feedback: { message: 'Partly correct.', expected: 'Guten Tag, ich heiße Peter.' },
        }}
      />,
    );
    const transcript = document.querySelector('.st-dictation__transcript');
    expect(transcript?.textContent).toBe('Transcript: Guten Tag, ich heiße Peter.');
    expect(transcript?.querySelector('[lang="de"]')).toBeTruthy();
    expect(area().readOnly).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Played 2 times');
    fireEvent.change(area(), { target: { value: 'x' } });
    playOnce();
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('~ Partly correct.');
  });

  it('is blocked while disabled and takes translated labels', () => {
    render(<Host disabled labels={{ input: 'Schreib, was du hörst', plays: (n) => `${n} mal` }} />);
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Schreib, was du hörst' }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Play audio' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole('status').textContent).toBe('0 mal');
  });
});
