import 'server-only';

// Feedback logic, kept free of Next so it can be tested with a real container.

import type { AuthSession, FeedbackItem, FeedbackKind } from '@stufen/contracts';
import { FeedbackValidationError } from '@stufen/core-feedback';
import type { ActionResult } from '../../lib/action-result';
import type { Container } from '../container';

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  rating?: number;
  /** The route the feedback was sent from. */
  page: string;
  context?: Record<string, unknown>;
}

/**
 * Stores one feedback row. A null session means signed out: the row is saved
 * without a user id. A broken rule comes back as a result, never as a throw.
 */
export async function submitFeedbackFor(
  container: Container,
  session: Pick<AuthSession, 'userId'> | null,
  input: FeedbackInput,
): Promise<ActionResult> {
  try {
    await container.feedback.submit({
      userId: session?.userId ?? null,
      kind: input.kind,
      message: input.message,
      rating: input.rating ?? null,
      page: input.page,
      context: input.context ?? null,
    });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return { ok: false, field: error.field, message: error.message };
    }
    throw error;
  }
  return { ok: true };
}

/** The user's own feedback, newest first. */
export async function listMyFeedback(
  container: Container,
  userId: string,
): Promise<FeedbackItem[]> {
  return container.feedback.listMine(userId);
}
