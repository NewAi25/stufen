'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AudioButton } from '../components/AudioButton';
import { TextArea } from '../components/TextArea';
import { ExerciseShell } from './Shell';
import { DEFAULT_AUDIO_LABELS, DEFAULT_COMMON_LABELS, toAudioButtonLabels } from './types';
import type {
  DictationPayload,
  DictationValue,
  ExerciseAudioLabels,
  ExerciseCommonLabels,
  ExerciseRendererProps,
} from './types';

export interface DictationLabels extends ExerciseCommonLabels, ExerciseAudioLabels {
  /** Label of the text area. Default "Type what you hear". */
  input: string;
  /** Help under the text area. */
  inputHint: string;
  /** The replay counter. Default gives "Played 2 times". */
  plays: (count: number) => string;
  /** Lead of the text that was spoken, shown after the answer. Default "Transcript". */
  transcript: string;
}

export type DictationExerciseProps = ExerciseRendererProps<
  DictationPayload,
  DictationValue,
  DictationLabels
>;

const DEFAULT_LABELS: DictationLabels = {
  ...DEFAULT_COMMON_LABELS,
  ...DEFAULT_AUDIO_LABELS,
  input: 'Type what you hear',
  inputHint: 'Space plays the audio while the box is empty. After that, use Ctrl and Space.',
  plays: (count) => {
    if (count === 0) return 'Not played yet';
    return count === 1 ? 'Played 1 time' : `Played ${count} times`;
  },
  transcript: 'Transcript',
};

export function DictationExercise({
  payload,
  value,
  onChange,
  disabled = false,
  result = null,
  labels,
  lang,
  instruction,
  className,
}: DictationExerciseProps) {
  const words = { ...DEFAULT_LABELS, ...labels };
  const audioRef = useRef<HTMLButtonElement | null>(null);
  const text = value?.text ?? '';
  // A value that already carries replays has been played at least once more than that.
  const [plays, setPlays] = useState(() => (value?.replays === undefined ? 0 : value.replays + 1));
  const graded = result !== null;
  const locked = disabled || graded;

  function onPlay(): void {
    const next = plays + 1;
    setPlays(next);
    // The first play is not a replay.
    if (!locked) onChange({ text, replays: next - 1 });
  }

  function setText(next: string): void {
    if (locked) return;
    onChange(plays > 0 ? { text: next, replays: plays - 1 } : { text: next });
  }

  // Space in the empty box plays the audio and types nothing.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== ' ' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (text !== '' || locked) return;
    event.preventDefault();
    audioRef.current?.click();
  }

  return (
    <ExerciseShell
      type="dictation"
      instruction={instruction}
      result={result}
      labels={words}
      lang={lang}
      className={className}
      showExpected={false}
    >
      <div className="st-dictation__audio">
        {/* Without a file the text is spoken. It is not in the page before the answer. */}
        <AudioButton
          ref={audioRef}
          src={payload.audio}
          text={payload.text}
          lang={lang}
          shortcut
          disabled={disabled}
          labels={toAudioButtonLabels(words)}
          onPlay={onPlay}
        />
        <span className="st-dictation__plays" role="status">
          {words.plays(plays)}
        </span>
      </div>
      <TextArea
        label={words.input}
        {...(locked ? {} : { hint: words.inputHint })}
        lang={lang}
        rows={3}
        value={text}
        disabled={disabled}
        readOnly={graded}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {graded ? (
        <p className="st-dictation__transcript">
          {words.transcript}: <span lang={lang}>{payload.text}</span>
        </p>
      ) : null}
    </ExerciseShell>
  );
}
