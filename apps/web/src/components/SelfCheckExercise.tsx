'use client';

import { useState } from 'react';
import { Button, TextArea } from '@stufen/ui-kit';
import type { SelfCheckContent } from '../lib/lesson-view';

/** Said once per task, in plain words. The same rule is in the README. */
export const SELF_CHECK_NOTE =
  'The tutor will grade tasks like this in a later version. ' +
  'Until then your answer is saved as a self check and does not count towards your level yet.';

const FIELD_LABELS: Record<SelfCheckContent['type'], string> = {
  translate: 'Your translation',
  write_free: 'Your text',
  speak_prompt: 'What you said (optional)',
};

export interface SelfCheckExerciseProps {
  content: SelfCheckContent;
  instruction: string | null;
  /** The target language, for `lang` on target language text. */
  lang: string;
  value: string;
  onChange: (value: string) => void;
  /** Set while the answer is being saved. */
  disabled?: boolean;
}

/** True when the answer can be saved. A spoken task needs no text. */
export function isSelfCheckComplete(content: SelfCheckContent, value: string): boolean {
  return content.type === 'speak_prompt' || value.trim() !== '';
}

/**
 * The host for translate, write_free and speak_prompt until their graders
 * exist: the task, a text area, and a button that shows the sample answer.
 * Showing the sample locks the text, so the saved answer is the learner's own.
 */
export function SelfCheckExercise({
  content,
  instruction,
  lang,
  value,
  onChange,
  disabled = false,
}: SelfCheckExerciseProps) {
  const [revealed, setRevealed] = useState(false);
  const speaking = content.type === 'speak_prompt';
  const writesTarget = content.type !== 'translate' || !content.promptInTarget;

  return (
    <div className={`st-exercise st-exercise--${content.type} app-self-check`}>
      {instruction === null || instruction === '' ? null : (
        <p className="st-exercise__instruction">{instruction}</p>
      )}
      <p className="app-self-check__prompt" lang={content.promptInTarget ? lang : undefined}>
        {content.prompt}
      </p>
      {content.promptNative === null ? null : (
        <p className="app-muted" lang={lang}>
          {content.promptNative}
        </p>
      )}
      {content.targetText === null ? null : (
        <p className="app-self-check__prompt" lang={lang}>
          {content.targetText}
        </p>
      )}
      {content.note === null ? null : <p className="app-muted">{content.note}</p>}
      {speaking ? (
        <p>Say your answer aloud. You can also type what you said, but you do not have to.</p>
      ) : null}
      <TextArea
        label={FIELD_LABELS[content.type]}
        lang={writesTarget ? lang : undefined}
        rows={speaking ? 2 : 4}
        value={value}
        readOnly={revealed}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {content.sample === null ? null : revealed ? (
        <div className="app-self-check__sample" role="status">
          <p className="app-self-check__sample-lead">Sample answer</p>
          <p lang={content.sampleInTarget ? lang : undefined}>{content.sample}</p>
          <p className="app-muted">Compare it with your answer. Other answers can be right too.</p>
        </div>
      ) : (
        <div>
          <Button variant="secondary" disabled={disabled} onClick={() => setRevealed(true)}>
            Show sample answer
          </Button>
        </div>
      )}
      <p className="app-self-check__note">{SELF_CHECK_NOTE}</p>
    </div>
  );
}
