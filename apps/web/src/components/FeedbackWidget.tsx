'use client';

import { usePathname } from 'next/navigation';
import { FeedbackFab, useToast } from '@stufen/ui-kit';
import type { FeedbackFabInput } from '@stufen/ui-kit';
import { submitFeedback } from '../app/feedback/actions';

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
 * every page. The ui-kit FeedbackFab keeps its open state to itself, so there
 * is no `f` shortcut here until the kit offers a way to open it from outside.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const toast = useToast();

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
      className="app-feedback-fab"
      onSubmit={send}
      onSubmitted={() => toast.show({ message: 'Sent. Thank you.', tone: 'success' })}
    />
  );
}
