// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioButton } from '../src/index';

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const spoken: FakeUtterance[] = [];
const synth = {
  speak: vi.fn((utterance: FakeUtterance) => {
    spoken.push(utterance);
  }),
  cancel: vi.fn(),
};

function installSpeech(): void {
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
  });
}

function removeSpeech(): void {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

function lastSpoken(): FakeUtterance {
  const utterance = spoken[spoken.length - 1];
  if (utterance === undefined) throw new Error('nothing was spoken');
  return utterance;
}

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spoken.length = 0;
  synth.speak.mockClear();
  synth.cancel.mockClear();
  installSpeech();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  removeSpeech();
});

function wrapper(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.st-audio');
  if (el === null) throw new Error('no audio button');
  return el;
}

function audioElement(): HTMLAudioElement {
  const el = document.querySelector('audio');
  if (el === null) throw new Error('no audio element');
  return el;
}

describe('AudioButton with a file', () => {
  it('has an accessible name and starts idle', () => {
    render(<AudioButton src="/audio/a.mp3" />);
    const button = screen.getByRole('button', { name: 'Play audio' });
    expect(button.classList.contains('st-audio__button')).toBe(true);
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(audioElement().getAttribute('src')).toBe('/audio/a.mp3');
    expect(play).not.toHaveBeenCalled();
  });

  it('plays the file on click, reports it, and stops on the next click', () => {
    const onPlay = vi.fn();
    const onEnded = vi.fn();
    render(<AudioButton src="/audio/a.mp3" onPlay={onPlay} onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(wrapper().getAttribute('data-state')).toBe('playing');
    fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(onEnded).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('goes back to idle and calls onEnded when the file ends', () => {
    const onEnded = vi.fn();
    render(<AudioButton src="/audio/a.mp3" onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    fireEvent.ended(audioElement());
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeTruthy();
  });

  it('sets the playback rate for slow playback', () => {
    render(<AudioButton src="/audio/a.mp3" rate={0.7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(audioElement().playbackRate).toBeCloseTo(0.7);
  });

  it('shows an error in words when the file fails and there is no text', async () => {
    play.mockImplementation(() => Promise.reject(new Error('no file')));
    render(<AudioButton src="/audio/missing.mp3" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
      await Promise.resolve();
    });
    expect(wrapper().getAttribute('data-state')).toBe('error');
    expect(screen.getByRole('alert').textContent).toBe('The audio did not play. Try again.');
    // The button stays usable, so the learner can try again.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Play audio' }).disabled).toBe(
      false,
    );
  });

  it('falls back to speech when the file fails and there is a text', async () => {
    play.mockImplementation(() => Promise.reject(new Error('no file')));
    render(<AudioButton src="/audio/missing.mp3" text="Guten Tag." lang="de" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
      await Promise.resolve();
    });
    expect(lastSpoken().text).toBe('Guten Tag.');
    expect(wrapper().getAttribute('data-state')).toBe('playing');
  });
});

describe('AudioButton with speech synthesis', () => {
  it('speaks the text with the language and the rate when there is no file', () => {
    render(<AudioButton text="Ich heiße Anna." lang="de" rate={0.7} />);
    expect(document.querySelector('audio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(lastSpoken().text).toBe('Ich heiße Anna.');
    expect(lastSpoken().lang).toBe('de');
    expect(lastSpoken().rate).toBeCloseTo(0.7);
    expect(play).not.toHaveBeenCalled();
    expect(wrapper().getAttribute('data-state')).toBe('playing');
  });

  it('returns to idle when the speech ends and cancels it on stop', () => {
    const onEnded = vi.fn();
    render(<AudioButton text="Hallo." onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    act(() => lastSpoken().onend?.());
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(onEnded).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    synth.cancel.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('shows the error state when speech fails, and idle when it was only cancelled', () => {
    render(<AudioButton text="Hallo." />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    act(() => lastSpoken().onerror?.({ error: 'synthesis-failed' }));
    expect(wrapper().getAttribute('data-state')).toBe('error');
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => lastSpoken().onerror?.({ error: 'interrupted' }));
    expect(wrapper().getAttribute('data-state')).toBe('idle');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a late callback of a run that was stopped', () => {
    const onEnded = vi.fn();
    render(<AudioButton text="Hallo." onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    const first = lastSpoken();
    fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    act(() => first.onend?.());
    expect(wrapper().getAttribute('data-state')).toBe('playing');
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('cancels the speech when it is unmounted while speaking', () => {
    const view = render(<AudioButton text="Hallo." />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    synth.cancel.mockClear();
    view.unmount();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});

describe('AudioButton when nothing can play', () => {
  it('shows a visible message and disables the button without speech synthesis', () => {
    removeSpeech();
    render(<AudioButton text="Hallo." />);
    expect(screen.getByText('Audio is not available in this browser.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Play audio' }).disabled).toBe(
      true,
    );
  });

  it('shows the same message with neither a file nor a text', () => {
    render(<AudioButton labels={{ unavailable: 'Kein Ton.' }} />);
    expect(screen.getByText('Kein Ton.')).toBeTruthy();
  });

  it('still plays a file without speech synthesis', () => {
    removeSpeech();
    render(<AudioButton src="/audio/a.mp3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Audio is not available in this browser.')).toBeNull();
  });
});

describe('AudioButton keys and options', () => {
  it('is a native button, so Space and Enter on it toggle playback', () => {
    render(<AudioButton text="Hallo." />);
    const button = screen.getByRole('button', { name: 'Play audio' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('with shortcut, Space on the page toggles playback', () => {
    render(<AudioButton text="Hallo." shortcut />);
    expect(screen.getByRole('button').getAttribute('aria-keyshortcuts')).toBe('Space');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(wrapper().getAttribute('data-state')).toBe('playing');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(wrapper().getAttribute('data-state')).toBe('idle');
  });

  it('with shortcut, Space is left alone in a text field and on another control', () => {
    render(
      <>
        <AudioButton text="Hallo." shortcut />
        <textarea aria-label="Your text" />
        <button type="button">Other</button>
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Other' }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Play audio' }), { key: ' ' });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('with shortcut, Ctrl plus Space toggles from a text field', () => {
    render(
      <>
        <AudioButton text="Hallo." shortcut />
        <textarea aria-label="Your text" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: ' ', ctrlKey: true });
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('without shortcut, Space on the page does nothing', () => {
    render(<AudioButton text="Hallo." />);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    render(<AudioButton text="Hallo." disabled shortcut />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('takes labels, className and a ref to the button', () => {
    let node: HTMLButtonElement | null = null;
    render(
      <AudioButton
        text="Hallo."
        className="mine"
        labels={{ play: 'Anhören', stop: 'Stopp' }}
        ref={(el) => {
          node = el;
        }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Anhören' });
    expect(node).toBe(button);
    expect(wrapper().className).toBe('st-audio mine');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Stopp' })).toBeTruthy();
  });
});
