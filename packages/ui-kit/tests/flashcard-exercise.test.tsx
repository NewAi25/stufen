// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlashcardExercise } from '../src/index';
import type { FlashcardExerciseProps, FlashcardPayload, FlashcardValue } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const PAYLOAD: FlashcardPayload = {
  front: 'die Stadt',
  back: 'the city, the town',
  hint: 'Plural: die Städte',
};

function Host(props: Partial<FlashcardExerciseProps> & { onValue?: (v: FlashcardValue) => void }) {
  const [value, setValue] = useState<FlashcardValue | null>(props.value ?? null);
  return (
    <FlashcardExercise
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

function ratings(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'How well did you know it?' })).getAllByRole(
    'button',
  );
}

describe('FlashcardExercise', () => {
  it('shows the front with lang and hides the back until revealed', () => {
    render(<Host instruction="Read the card, then turn it over." />);
    expect(screen.getByText('Read the card, then turn it over.')).toBeTruthy();
    expect(screen.getByText('die Stadt').getAttribute('lang')).toBe('de');
    expect(screen.queryByText('the city, the town')).toBeNull();
    expect(screen.queryByRole('group', { name: 'How well did you know it?' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeTruthy();
  });

  it('reveals the back, the hint and an audio button on click, and moves focus to the answer', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('the city, the town')).toBeTruthy();
    expect(screen.getByText('Plural: die Städte')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.st-flashcard__back'));
    expect(ratings().map((el) => el.textContent)).toEqual(['1Again', '2Hard', '3Good', '4Easy']);
  });

  it('reveals on Space, but not while focus is in a text field', () => {
    render(
      <>
        <Host />
        <input aria-label="Other field" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: ' ' });
    expect(screen.queryByText('the city, the town')).toBeNull();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByText('the city, the town')).toBeTruthy();
  });

  it('rates with the four buttons and with keys 1 to 4, only once revealed', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.keyDown(document.body, { key: '3' });
    expect(onValue).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '3' });
    expect(onValue).toHaveBeenLastCalledWith({ rating: 'good' });
    expect(ratings()[2]?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(onValue).toHaveBeenLastCalledWith({ rating: 'again' });
    fireEvent.keyDown(document.body, { key: '4' });
    expect(onValue).toHaveBeenLastCalledWith({ rating: 'easy' });
    fireEvent.keyDown(document.body, { key: '5' });
    expect(onValue).toHaveBeenCalledTimes(3);
    expect(ratings().map((el) => el.getAttribute('aria-keyshortcuts'))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('opens a card that already has a rating', () => {
    render(<Host value={{ rating: 'hard' }} />);
    expect(screen.getByText('the city, the town')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hard' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing while disabled, and is read only after a result', () => {
    const onValue = vi.fn();
    const view = render(<Host disabled onValue={onValue} />);
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.queryByText('the city, the town')).toBeNull();
    view.unmount();
    render(
      <Host
        value={{ rating: 'good' }}
        onValue={onValue}
        result={{ correct: true, score: 1, feedback: { message: 'Saved.' } }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    fireEvent.keyDown(document.body, { key: '1' });
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Saved.');
  });

  it('takes translated labels', () => {
    render(<Host labels={{ reveal: 'Antwort zeigen', good: 'Gut' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Antwort zeigen' }));
    expect(screen.getByRole('button', { name: 'Gut' })).toBeTruthy();
  });
});
