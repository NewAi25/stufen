'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FeedbackFab, useToast } from '@stufen/ui-kit';
import type { FeedbackFabInput } from '@stufen/ui-kit';
import { submitFeedback } from '../app/feedback/actions';
import {
  feedbackShortcutEnabled,
  isExerciseRoute,
  isFeedbackKey,
  isTypingTarget,
} from '../lib/feedback-shortcut';

/** What is sent with every feedback row so the page and setup can be found. */
function captureContext(): Record<string, unknown> {
  return {
    theme: document.documentElement.getAttribute('data-theme') ?? 'system',
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    language: navigator.language,
  };
}

/**
 * The floating feedback button, rendered once in the root layout so it is on
 * every page. This component owns the open state of the sheet, so the `f` key
 * can open it: pressed outside a text field, a select and editable text. On
 * the lesson and review screens the exercises use letter keys, so the
 * shortcut is off there and the button is the way in.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const shortcut = feedbackShortcutEnabled(pathname);
  const onExercise = isExerciseRoute(pathname);

  useEffect(() => {
    if (!shortcut) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (!isFeedbackKey(event)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isTypingTarget(target)) return;
      // An open dialog keeps its keys, the feedback sheet included.
      if (target?.closest('[role="dialog"]')) return;
      event.preventDefault();
      setOpen(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  async function send(input: FeedbackFabInput): Promise<void> {
    const result = await submitFeedback({
      ...input,
      page: pathname,
      context: captureContext(),
    });
    // The fab shows the message of a thrown error and keeps the text.
    if (!result.ok) throw new Error(result.message);
  }

  return (
    <FeedbackFab
      className={onExercise ? 'app-feedback-fab app-feedback-fab--quiet' : 'app-feedback-fab'}
      open={open}
      onOpenChange={setOpen}
      defaultKind={onExercise ? 'confusing' : 'idea'}
      onSubmit={send}
      onSubmitted={() => toast.show({ message: 'Sent. Thank you.', tone: 'success' })}
    />
  );
}
