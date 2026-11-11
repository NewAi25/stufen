'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { cx } from './cx';

export type AudioButtonState = 'idle' | 'playing' | 'error';

export interface AudioButtonLabels {
  /** Name of the button while nothing plays. Default "Play audio". */
  play: string;
  /** Name of the button while it plays. Default "Stop audio". */
  stop: string;
  /** Shown when playback failed. */
  error: string;
  /** Shown when the browser can play neither the file nor speech. */
  unavailable: string;
}

export interface AudioButtonProps {
  /** URL of an audio file. Played through an audio element. */
  src?: string | undefined;
  /** Spoken with the browser speech synthesis when there is no `src`, or when the file fails. */
  text?: string | undefined;
  /** BCP 47 tag of the spoken language, for example `de`. Picks the voice. */
  lang?: string | undefined;
  /** Playback speed. 1 is normal, 0.7 is slow. Default 1. */
  rate?: number;
  labels?: Partial<AudioButtonLabels>;
  disabled?: boolean;
  /**
   * When true, Space toggles playback from anywhere on the page unless focus
   * is in a text field or on another control, and Ctrl plus Space toggles it
   * from a text field too.
   */
  shortcut?: boolean;
  /** Called each time playback starts. */
  onPlay?: () => void;
  /** Called when playback reaches the end. Not called on stop. */
  onEnded?: () => void;
  className?: string;
  /** Goes to the button element. */
  ref?: Ref<HTMLButtonElement>;
}

const DEFAULT_LABELS: AudioButtonLabels = {
  play: 'Play audio',
  stop: 'Stop audio',
  error: 'The audio did not play. Try again.',
  unavailable: 'Audio is not available in this browser.',
};

const SHORTCUT_BLOCKERS =
  'input, textarea, select, button, a[href], summary, [role="radio"], [role="button"], [contenteditable]:not([contenteditable="false"])';
const TEXT_FIELDS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  const hasSynth = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  return hasSynth ? window.speechSynthesis : null;
}

function safeRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? Math.min(Math.max(rate, 0.25), 4) : 1;
}

export function AudioButton({
  src,
  text,
  lang,
  rate = 1,
  labels,
  disabled = false,
  shortcut = false,
  onPlay,
  onEnded,
  className,
  ref,
}: AudioButtonProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Changes on every start and stop, so a late callback of an older run is ignored.
  const run = useRef(0);
  // Which of the two is making sound right now.
  const channel = useRef<'audio' | 'speech' | null>(null);
  const [state, setState] = useState<AudioButtonState>('idle');
  // Assumed until mounted, so the server and the first client render agree.
  const [synthReady, setSynthReady] = useState(true);

  useEffect(() => {
    setSynthReady(getSynth() !== null);
  }, []);

  const hasSrc = src !== undefined && src !== '';
  const hasText = text !== undefined && text.trim() !== '';
  const available = hasSrc || (hasText && synthReady);

  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  function finish(id: number, how: 'idle' | 'stopped' | 'error'): void {
    if (run.current !== id) return;
    run.current += 1;
    channel.current = null;
    setState(how === 'error' ? 'error' : 'idle');
    if (how === 'idle') onEnded?.();
  }

  // Returns false when speech cannot start.
  function speak(id: number): boolean {
    const synth = getSynth();
    if (synth === null || !hasText || text === undefined) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    if (lang !== undefined) utterance.lang = lang;
    utterance.rate = safeRate(rate);
    utterance.onend = () => finish(id, 'idle');
    // Another button that starts speaking cancels this one. That is a stop, not a failure.
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') finish(id, 'stopped');
      else finish(id, 'error');
    };
    synth.cancel();
    channel.current = 'speech';
    synth.speak(utterance);
    return true;
  }

  function fail(id: number): void {
    // A file that does not load falls back to speech when there is a text.
    if (run.current === id && !speak(id)) finish(id, 'error');
  }

  function start(): void {
    run.current += 1;
    const id = run.current;
    setState('playing');
    onPlay?.();
    const audio = audioRef.current;
    if (!hasSrc || audio === null) {
      if (!speak(id)) finish(id, 'error');
      return;
    }
    channel.current = 'audio';
    try {
      audio.currentTime = 0;
      audio.playbackRate = safeRate(rate);
      const playing: Promise<void> | undefined = audio.play();
      playing?.catch(() => fail(id));
    } catch {
      fail(id);
    }
  }

  function stop(): void {
    run.current += 1;
    if (channel.current === 'audio') audioRef.current?.pause();
    if (channel.current === 'speech') getSynth()?.cancel();
    channel.current = null;
    setState('idle');
  }

  function toggle(): void {
    if (disabled || !available) return;
    if (state === 'playing') stop();
    else start();
  }

  // Stops the sound when the source changes and when the button goes away.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      run.current += 1;
      if (channel.current === 'audio') audio?.pause();
      if (channel.current === 'speech') getSynth()?.cancel();
      channel.current = null;
      setState('idle');
    };
  }, [src, text]);

  // Subscribed again on each render so the handler sees the current state.
  useEffect(() => {
    if (!shortcut || disabled || !available) return undefined;
    function onDocumentKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key !== ' ' || event.defaultPrevented || event.altKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const blockers = event.ctrlKey ? null : SHORTCUT_BLOCKERS;
      if (target !== null && blockers !== null && target.closest(blockers) !== null) return;
      if (target !== null && event.ctrlKey && target.closest(TEXT_FIELDS) === null) return;
      event.preventDefault();
      toggle();
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  });

  const playing = state === 'playing';
  const name = playing ? words.stop : words.play;

  return (
    <span className={cx('st-audio', className)} data-state={state}>
      <button
        ref={setButtonRef}
        type="button"
        className="st-audio__button"
        aria-label={name}
        aria-keyshortcuts={shortcut ? 'Space' : undefined}
        disabled={disabled || !available}
        onClick={toggle}
      >
        <span className="st-audio__icon" aria-hidden="true">
          {playing ? '■' : '▶'}
        </span>
        <span className="st-audio__label">{name}</span>
      </button>
      {hasSrc ? (
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onEnded={() => {
            if (channel.current === 'audio') finish(run.current, 'idle');
          }}
          onError={() => {
            if (channel.current === 'audio') fail(run.current);
          }}
        />
      ) : null}
      {state === 'error' ? (
        <span className="st-audio__message st-audio__message--error" role="alert">
          {words.error}
        </span>
      ) : null}
      {!available ? <span className="st-audio__message">{words.unavailable}</span> : null}
    </span>
  );
}
